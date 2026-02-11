#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMaxScore } from "../../../src/core/scoring.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const DICT_PATH = path.join(repoRoot, "data/dictionary-v1.json");
const PUZZLES_PATH = path.join(repoRoot, "data/puzzles-v1.json");
const POLICY_PATH = path.join(repoRoot, "data/raw/policy.json");

const RANK_KEYS = [
  "beginner",
  "goodStart",
  "movingUp",
  "good",
  "solid",
  "nice",
  "great",
  "amazing",
  "genius",
  "queenBee"
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const ALPHA_RE = /^[a-z]+$/u;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseIsoDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function diffDays(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length;
}

function isSorted(values) {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) {
      return false;
    }
  }
  return true;
}

function isSubsetWord(word, allowedSet) {
  for (const char of word) {
    if (!allowedSet.has(char)) {
      return false;
    }
  }
  return true;
}

function isPangram(word, allowedSet) {
  const chars = new Set(word);
  if (chars.size !== allowedSet.size) {
    return false;
  }
  for (const char of allowedSet) {
    if (!chars.has(char)) {
      return false;
    }
  }
  return true;
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const [dict, puzzlesPayload, policy] = await Promise.all([
    loadJson(DICT_PATH),
    loadJson(PUZZLES_PATH),
    loadJson(POLICY_PATH)
  ]);

  const minLength = Number(policy?.minLength) || 4;

  assert(dict?.version === "v1", `Expected dictionary version "v1"; got "${dict?.version}"`);
  assert(Array.isArray(dict?.words), "dictionary.words must be an array");
  assert(hasUniqueValues(dict.words), "dictionary.words must not contain duplicates");
  assert(isSorted(dict.words), "dictionary.words must be sorted");
  for (const word of dict.words) {
    assert(ALPHA_RE.test(word), `dictionary word must be lowercase alpha: "${word}"`);
    assert(word.length >= minLength, `dictionary word shorter than minLength (${minLength}): "${word}"`);
  }

  assert(puzzlesPayload?.version === "v1", `Expected puzzles version "v1"; got "${puzzlesPayload?.version}"`);
  assert(
    puzzlesPayload?.sourceDictionaryVersion === dict.version,
    "puzzles sourceDictionaryVersion must match dictionary version"
  );
  assert(Array.isArray(puzzlesPayload?.puzzles), "puzzles must be an array");
  assert(puzzlesPayload.puzzles.length > 0, "puzzles must not be empty");

  const puzzleIds = puzzlesPayload.puzzles.map((puzzle) => puzzle.id);
  assert(hasUniqueValues(puzzleIds), "puzzle ids must be unique");

  for (let i = 0; i < puzzlesPayload.puzzles.length; i += 1) {
    const puzzle = puzzlesPayload.puzzles[i];
    const context = `puzzle[${i}]`;

    assert(typeof puzzle.id === "string" && ISO_DATE_RE.test(puzzle.id), `${context} id must be ISO date`);
    assert(typeof puzzle.date === "string" && ISO_DATE_RE.test(puzzle.date), `${context} date must be ISO date`);
    assert(puzzle.id === puzzle.date, `${context} id must equal date`);

    if (i > 0) {
      const prev = puzzlesPayload.puzzles[i - 1];
      const dayDelta = diffDays(parseIsoDate(prev.date), parseIsoDate(puzzle.date));
      assert(dayDelta === 1, `${context} date must be contiguous (+1 day) from previous puzzle`);
    }

    assert(typeof puzzle.centerLetter === "string" && ALPHA_RE.test(puzzle.centerLetter), `${context} invalid centerLetter`);
    assert(Array.isArray(puzzle.outerLetters), `${context} outerLetters must be an array`);
    assert(puzzle.outerLetters.length === 6, `${context} outerLetters must have 6 letters`);
    assert(hasUniqueValues(puzzle.outerLetters), `${context} outerLetters must be unique`);
    assert(!puzzle.outerLetters.includes(puzzle.centerLetter), `${context} centerLetter cannot appear in outerLetters`);
    for (const letter of puzzle.outerLetters) {
      assert(typeof letter === "string" && /^[a-z]$/u.test(letter), `${context} outerLetters must be single lowercase chars`);
    }

    assert(Array.isArray(puzzle.validWords), `${context} validWords must be an array`);
    assert(Array.isArray(puzzle.pangrams), `${context} pangrams must be an array`);
    assert(hasUniqueValues(puzzle.validWords), `${context} validWords must be unique`);
    assert(hasUniqueValues(puzzle.pangrams), `${context} pangrams must be unique`);
    assert(isSorted(puzzle.validWords), `${context} validWords must be sorted`);
    assert(isSorted(puzzle.pangrams), `${context} pangrams must be sorted`);

    const allowedSet = new Set([puzzle.centerLetter, ...puzzle.outerLetters]);
    assert(allowedSet.size === 7, `${context} must define exactly 7 unique letters`);

    for (const word of puzzle.validWords) {
      assert(ALPHA_RE.test(word), `${context} validWords must be lowercase alpha: "${word}"`);
      assert(word.length >= minLength, `${context} valid word shorter than minLength: "${word}"`);
      assert(word.includes(puzzle.centerLetter), `${context} valid word missing center letter: "${word}"`);
      assert(isSubsetWord(word, allowedSet), `${context} valid word uses disallowed letter: "${word}"`);
    }

    const validSet = new Set(puzzle.validWords);
    for (const word of puzzle.pangrams) {
      assert(validSet.has(word), `${context} pangram missing from validWords: "${word}"`);
      assert(isPangram(word, allowedSet), `${context} pangram does not use all 7 letters: "${word}"`);
    }

    assert(puzzle.dictionaryVersion === dict.version, `${context} dictionaryVersion must match dictionary version`);
    const computedMax = computeMaxScore(puzzle.validWords, new Set(puzzle.pangrams));
    assert(puzzle.maxScore === computedMax, `${context} maxScore mismatch: expected ${computedMax} got ${puzzle.maxScore}`);

    const thresholds = puzzle.rankThresholds;
    assert(thresholds && typeof thresholds === "object", `${context} missing rankThresholds`);
    for (const key of RANK_KEYS) {
      assert(Number.isInteger(thresholds[key]), `${context} threshold "${key}" must be integer`);
    }
    let previous = -Infinity;
    for (const key of RANK_KEYS) {
      const value = thresholds[key];
      assert(value >= previous, `${context} threshold "${key}" must be monotonic`);
      previous = value;
    }
    assert(thresholds.beginner === 0, `${context} beginner threshold must be 0`);
    assert(thresholds.queenBee === puzzle.maxScore, `${context} queenBee threshold must equal maxScore`);
  }

  console.log(
    `Pipeline validation passed: dictionaryWords=${dict.words.length} puzzles=${puzzlesPayload.puzzles.length} minLength=${minLength}`
  );
}

main().catch((error) => {
  console.error(`Pipeline validation failed: ${error.message}`);
  process.exit(1);
});
