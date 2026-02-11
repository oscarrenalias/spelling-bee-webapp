import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeMaxScore } from "../src/core/scoring.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const INPUT_DICT = path.join(rootDir, "data/dictionary-v1.json");
const OUTPUT_PUZZLES = path.join(rootDir, "data/puzzles-v1.json");

const MIN_WORDS = 12;
const MIN_PANGRAMS = 1;
const MAX_PUZZLES = 60;

function comparablePayload(payload) {
  return {
    version: payload.version,
    sourceDictionaryVersion: payload.sourceDictionaryVersion,
    puzzles: payload.puzzles
  };
}

function parseArgs(argv) {
  const parsed = {
    startDate: null,
    count: MAX_PUZZLES
  };

  for (const arg of argv) {
    if (arg.startsWith("--start=")) {
      parsed.startDate = arg.slice("--start=".length);
    }
    if (arg.startsWith("--count=")) {
      const count = Number(arg.slice("--count=".length));
      if (Number.isFinite(count) && count > 0) {
        parsed.count = Math.floor(count);
      }
    }
  }

  return parsed;
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate, offset) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return localIsoDate(date);
}

function uniqueLetters(word) {
  return new Set(word);
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
  const chars = uniqueLetters(word);
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

function rankThresholds(maxScore) {
  const pct = {
    beginner: 0,
    goodStart: 0.02,
    movingUp: 0.05,
    good: 0.08,
    solid: 0.15,
    nice: 0.25,
    great: 0.4,
    amazing: 0.5,
    genius: 0.7,
    queenBee: 1
  };

  const thresholds = {};
  for (const [key, value] of Object.entries(pct)) {
    thresholds[key] = Math.floor(maxScore * value);
  }
  return thresholds;
}

function buildCandidates(words) {
  const sevenLetterSets = new Map();

  for (const word of words) {
    if (word.length < 7) {
      continue;
    }

    const chars = uniqueLetters(word);
    if (chars.size !== 7) {
      continue;
    }

    const signature = [...chars].sort().join("");
    if (!sevenLetterSets.has(signature)) {
      sevenLetterSets.set(signature, chars);
    }
  }

  const candidates = [];

  for (const [signature, letterSet] of sevenLetterSets.entries()) {
    for (const centerLetter of letterSet) {
      const allowedSet = letterSet;
      const validWords = words.filter((word) => word.includes(centerLetter) && isSubsetWord(word, allowedSet));
      const pangrams = validWords.filter((word) => isPangram(word, allowedSet));

      if (validWords.length < MIN_WORDS || pangrams.length < MIN_PANGRAMS) {
        continue;
      }

      const maxScore = computeMaxScore(validWords, new Set(pangrams));
      const outerLetters = [...allowedSet].filter((letter) => letter !== centerLetter).sort();

      candidates.push({
        signature,
        centerLetter,
        outerLetters,
        validWords: validWords.sort(),
        pangrams: pangrams.sort(),
        maxScore,
        rankThresholds: rankThresholds(maxScore),
        quality: maxScore + validWords.length * 3 + pangrams.length * 10
      });
    }
  }

  candidates.sort((a, b) => b.quality - a.quality);

  const uniqueByCore = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.signature}:${candidate.centerLetter}`;
    if (!uniqueByCore.has(key)) {
      uniqueByCore.set(key, candidate);
    }
  }

  return [...uniqueByCore.values()];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dictRaw = await fs.readFile(INPUT_DICT, "utf8");
  const dictionary = JSON.parse(dictRaw);
  const words = dictionary.words;

  const candidates = buildCandidates(words);
  const start = args.startDate ?? localIsoDate(new Date());

  const selected = candidates.slice(0, args.count);

  const puzzles = selected.map((candidate, idx) => {
    const date = addDays(start, idx);
    return {
      id: date,
      date,
      centerLetter: candidate.centerLetter,
      outerLetters: candidate.outerLetters,
      dictionaryVersion: dictionary.version,
      validWords: candidate.validWords,
      pangrams: candidate.pangrams,
      maxScore: candidate.maxScore,
      rankThresholds: candidate.rankThresholds
    };
  });

  const payload = {
    version: "v1",
    generatedAt: new Date().toISOString(),
    sourceDictionaryVersion: dictionary.version,
    puzzles
  };

  let shouldWrite = true;
  try {
    const existingRaw = await fs.readFile(OUTPUT_PUZZLES, "utf8");
    const existingPayload = JSON.parse(existingRaw);
    shouldWrite = JSON.stringify(comparablePayload(existingPayload)) !== JSON.stringify(comparablePayload(payload));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  if (shouldWrite) {
    await fs.writeFile(OUTPUT_PUZZLES, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } else {
    console.log("Puzzle build skipped write (no content changes).");
  }

  console.log(`Puzzle build complete. candidates=${candidates.length} published=${puzzles.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
