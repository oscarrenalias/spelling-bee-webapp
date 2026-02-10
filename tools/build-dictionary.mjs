import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const INPUT_ALLOW = path.join(rootDir, "data/raw/allowlist.txt");
const INPUT_BLOCK = path.join(rootDir, "data/raw/blocklist.txt");
const INPUT_POLICY = path.join(rootDir, "data/raw/policy.json");

const OUTPUT_DICT = path.join(rootDir, "data/dictionary-v1.json");
const OUTPUT_META = path.join(rootDir, "data/dictionary-v1-meta.json");

function parseWordLines(content) {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/u)[0])
    .filter(Boolean);
}

function toSet(values) {
  return new Set(values.map((value) => value.toLowerCase()));
}

function isAlphaWord(word) {
  return /^[a-z]+$/u.test(word);
}

function matchesBlockedPattern(word, patterns) {
  return patterns.some((pattern) => new RegExp(pattern, "u").test(word));
}

function isConsonant(char) {
  return /^[bcdfghjklmnpqrstvwxyz]$/u.test(char);
}

function buildCommonInflectionCandidates(baseWord) {
  const candidates = new Set();

  if (!baseWord) {
    return [];
  }

  const endsWithY = baseWord.endsWith("y");
  const preY = endsWithY ? baseWord.at(-2) : "";
  const consonantY = Boolean(preY) && isConsonant(preY);
  const endsWithE = baseWord.endsWith("e");
  const takesEs = /(s|x|z|ch|sh)$/u.test(baseWord);

  candidates.add(`${baseWord}s`);
  if (takesEs) {
    candidates.add(`${baseWord}es`);
  }
  if (consonantY) {
    candidates.add(`${baseWord.slice(0, -1)}ies`);
  }

  if (endsWithE) {
    candidates.add(`${baseWord}d`);
    candidates.add(`${baseWord.slice(0, -1)}ing`);
  } else if (consonantY) {
    candidates.add(`${baseWord.slice(0, -1)}ied`);
    candidates.add(`${baseWord}ing`);
  } else {
    candidates.add(`${baseWord}ed`);
    candidates.add(`${baseWord}ing`);
  }

  return [...candidates];
}

function resolveInputPath(filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(rootDir, filePath);
}

function toSourceConfig(entry) {
  if (typeof entry === "string") {
    return { path: entry, optional: false };
  }
  return {
    path: entry.path,
    optional: Boolean(entry.optional)
  };
}

async function maybeReadUtf8(filePath, optional) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (optional && error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseFrequencyTable(raw, frequencyConfig) {
  const format = frequencyConfig.format ?? "tsv";
  if (format === "json") {
    const payload = JSON.parse(raw);
    if (Array.isArray(payload)) {
      const wordColumn = frequencyConfig.wordColumn ?? "word";
      const zipfColumn = frequencyConfig.zipfColumn ?? "zipf";
      return payload;
    }
    return Object.entries(payload).map(([word, zipf]) => ({ word, zipf }));
  }

  const delimiter = format === "csv" ? "," : "\t";
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const header = lines[0].split(delimiter).map((value) => value.trim());
  const wordColumn = frequencyConfig.wordColumn ?? "word";
  const zipfColumn = frequencyConfig.zipfColumn ?? "zipf";
  const wordIdx = header.indexOf(wordColumn);
  const zipfIdx = header.indexOf(zipfColumn);

  if (wordIdx < 0 || zipfIdx < 0) {
    throw new Error(`Missing frequency columns. expected="${wordColumn},${zipfColumn}" found="${header.join(",")}"`);
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter);
    return {
      word: cols[wordIdx],
      zipf: cols[zipfIdx]
    };
  });
}

async function loadFrequencyMap(frequencyConfig, counters) {
  if (!frequencyConfig?.enabled) {
    return new Map();
  }

  const filePath = resolveInputPath(frequencyConfig.path ?? "data/raw/sources/wordfreq.tsv");
  const raw = await maybeReadUtf8(filePath, Boolean(frequencyConfig.optional));
  if (raw === null) {
    return new Map();
  }

  const rows = parseFrequencyTable(raw, frequencyConfig);
  const map = new Map();
  for (const row of rows) {
    const word = String(row.word ?? "").trim().toLowerCase();
    const zipf = Number(row.zipf);
    if (!word || !Number.isFinite(zipf)) {
      continue;
    }
    map.set(word, zipf);
  }

  counters.frequencyRowsLoaded = map.size;
  return map;
}

async function loadSourceWords(policy, counters) {
  const sourceEntries = Array.isArray(policy.sourceWordLists) && policy.sourceWordLists.length > 0
    ? policy.sourceWordLists
    : ["data/raw/dictionary-base.txt"];

  const merged = [];
  const resolved = [];

  for (const entry of sourceEntries) {
    const source = toSourceConfig(entry);
    const absolutePath = resolveInputPath(source.path);
    const raw = await maybeReadUtf8(absolutePath, source.optional);
    if (raw === null) {
      continue;
    }

    const words = parseWordLines(raw);
    merged.push(...words);
    resolved.push(source.path);
    counters.sourceWordCounts[source.path] = words.length;
  }

  if (merged.length === 0) {
    throw new Error("No source words loaded. Check data/raw/policy.json sourceWordLists.");
  }

  counters.sourceFilesUsed = resolved;
  return merged;
}

function buildMeta(policyVersion, sourceVersion, counters, finalTotal, frequencyConfig) {
  return {
    sourceName: "scowl+wordfreq+project-policy",
    sourceVersion,
    license: "mixed-open-sources",
    policyVersion,
    sourceFilesUsed: counters.sourceFilesUsed,
    sourceWordCounts: counters.sourceWordCounts,
    frequency: {
      enabled: Boolean(frequencyConfig?.enabled),
      file: frequencyConfig?.path ?? null,
      minZipf: Number.isFinite(Number(frequencyConfig?.minZipf)) ? Number(frequencyConfig.minZipf) : null,
      rowsLoaded: counters.frequencyRowsLoaded
    },
    counts: {
      inputTotal: counters.inputTotal,
      normalizedTotal: counters.normalizedTotal,
      removedByFrequency: counters.removedByFrequency,
      removedMissingFrequency: counters.removedMissingFrequency,
      removedProfanity: counters.removedProfanity,
      removedProperNouns: counters.removedProperNouns,
      removedGeoTerms: counters.removedGeoTerms,
      removedDemonyms: counters.removedDemonyms,
      removedAbbreviations: counters.removedAbbreviations,
      removedRare: counters.removedRare,
      inflectionsAdded: counters.inflectionsAdded,
      allowlistAdded: counters.allowlistAdded,
      blocklistRemoved: counters.blocklistRemoved,
      finalTotal
    }
  };
}

async function main() {
  const [allowRaw, blockRaw, policyRaw] = await Promise.all([
    fs.readFile(INPUT_ALLOW, "utf8"),
    fs.readFile(INPUT_BLOCK, "utf8"),
    fs.readFile(INPUT_POLICY, "utf8")
  ]);

  const policy = JSON.parse(policyRaw);
  const frequencyConfig = policy.frequency ?? {};
  const includeCommonInflections = Boolean(policy.includeCommonInflections);
  const allowlist = toSet(parseWordLines(allowRaw));
  const blocklist = toSet(parseWordLines(blockRaw));

  const profanity = toSet(policy.profanity ?? []);
  const geoTerms = toSet(policy.geoTerms ?? []);
  const demonyms = toSet(policy.demonyms ?? []);
  const rareTerms = toSet(policy.rareTerms ?? []);
  const blockedPatterns = policy.blockedPatterns ?? [];

  const counters = {
    inputTotal: 0,
    normalizedTotal: 0,
    sourceFilesUsed: [],
    sourceWordCounts: {},
    frequencyRowsLoaded: 0,
    removedByFrequency: 0,
    removedMissingFrequency: 0,
    removedProfanity: 0,
    removedProperNouns: 0,
    removedGeoTerms: 0,
    removedDemonyms: 0,
    removedAbbreviations: 0,
    removedRare: 0,
    inflectionsAdded: 0,
    allowlistAdded: 0,
    blocklistRemoved: 0
  };

  const [baseWords, frequencyMap] = await Promise.all([
    loadSourceWords(policy, counters),
    loadFrequencyMap(frequencyConfig, counters)
  ]);
  counters.inputTotal = baseWords.length;
  const minZipf = Number.isFinite(Number(frequencyConfig.minZipf))
    ? Number(frequencyConfig.minZipf)
    : null;

  const normalized = new Set();
  for (const word of baseWords) {
    normalized.add(word.normalize("NFKC"));
  }
  counters.normalizedTotal = normalized.size;
  const normalizedLowerSet = new Set([...normalized].map((word) => word.toLowerCase()));
  const nonFrequencyEligible = new Set();
  for (const rawWord of normalized) {
    const word = rawWord.toLowerCase();
    if (!isAlphaWord(word)) {
      continue;
    }
    if (word.length < (policy.minimumLength ?? 4)) {
      continue;
    }
    if (matchesBlockedPattern(word, blockedPatterns)) {
      continue;
    }
    if (policy.excludeProfanity && profanity.has(word)) {
      continue;
    }
    if (policy.excludeGeoTerms && geoTerms.has(word)) {
      continue;
    }
    if (policy.excludeDemonyms && demonyms.has(word)) {
      continue;
    }
    if (policy.excludeRare && rareTerms.has(word)) {
      continue;
    }
    nonFrequencyEligible.add(word);
  }

  const filtered = new Set();

  for (const rawWord of normalized) {
    const word = rawWord.toLowerCase();

    if (!isAlphaWord(word)) {
      counters.removedAbbreviations += 1;
      continue;
    }

    if (word.length < (policy.minimumLength ?? 4)) {
      counters.removedAbbreviations += 1;
      continue;
    }

    if (matchesBlockedPattern(word, blockedPatterns)) {
      counters.removedAbbreviations += 1;
      continue;
    }

    if (frequencyConfig.enabled && minZipf !== null) {
      const score = frequencyMap.get(word);
      if (score === undefined) {
        if (frequencyConfig.requireScore) {
          counters.removedMissingFrequency += 1;
          continue;
        }
      } else if (score < minZipf) {
        counters.removedByFrequency += 1;
        continue;
      }
    }

    if (policy.excludeProfanity && profanity.has(word)) {
      counters.removedProfanity += 1;
      continue;
    }

    if (policy.excludeGeoTerms && geoTerms.has(word)) {
      counters.removedGeoTerms += 1;
      continue;
    }

    if (policy.excludeDemonyms && demonyms.has(word)) {
      counters.removedDemonyms += 1;
      continue;
    }

    if (policy.excludeRare && rareTerms.has(word)) {
      counters.removedRare += 1;
      continue;
    }

    filtered.add(word);
  }

  for (const word of allowlist) {
    if (!filtered.has(word)) {
      filtered.add(word);
      counters.allowlistAdded += 1;
    }
  }

  if (includeCommonInflections) {
    const acceptedBaseWords = [...filtered];
    for (const baseWord of acceptedBaseWords) {
      const candidates = buildCommonInflectionCandidates(baseWord);
      for (const candidate of candidates) {
        if (!normalizedLowerSet.has(candidate)) {
          continue;
        }
        if (!nonFrequencyEligible.has(candidate)) {
          continue;
        }
        if (!filtered.has(candidate)) {
          filtered.add(candidate);
          counters.inflectionsAdded += 1;
        }
      }
    }
  }

  for (const word of blocklist) {
    if (filtered.delete(word)) {
      counters.blocklistRemoved += 1;
    }
  }

  const words = [...filtered].sort();

  const dictionaryPayload = {
    version: "v1",
    strict: true,
    words
  };

  const metaPayload = buildMeta(
    policy.version ?? "v1",
    policy.sourceVersion ?? "v1",
    counters,
    words.length,
    frequencyConfig
  );

  await Promise.all([
    fs.writeFile(OUTPUT_DICT, `${JSON.stringify(dictionaryPayload, null, 2)}\n`, "utf8"),
    fs.writeFile(OUTPUT_META, `${JSON.stringify(metaPayload, null, 2)}\n`, "utf8")
  ]);

  console.log(`Dictionary build complete. words=${words.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
