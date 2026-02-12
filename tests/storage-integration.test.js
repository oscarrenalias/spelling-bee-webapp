import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, decoratePuzzle, submitWord } from "../src/core/game-engine.js";
import { openDb } from "../src/storage/idb.js";
import { loadSessionById, loadSessions, saveSession } from "../src/storage/repositories.js";
import { createFakeIndexedDb } from "./helpers/fake-indexeddb.js";

const DB_NAME = "renalias_spelling_bee_webapp_db";

const puzzleA = decoratePuzzle({
  id: "2026-02-10",
  date: "2026-02-10",
  centerLetter: "a",
  outerLetters: ["c", "e", "l", "n", "r", "t"],
  validWords: ["acre", "alert", "alter", "central"],
  pangrams: ["central"],
  rankThresholds: {
    beginner: 0,
    goodStart: 2,
    movingUp: 4,
    good: 8,
    solid: 12,
    nice: 16,
    great: 20,
    amazing: 24,
    genius: 28,
    queenBee: 31
  }
});

const puzzleB = decoratePuzzle({
  id: "2026-02-11",
  date: "2026-02-11",
  centerLetter: "o",
  outerLetters: ["b", "e", "l", "m", "p", "r"],
  validWords: ["bloom", "boom", "bore", "boreal", "boomer", "mole", "more", "probe", "problem", "proem", "robe", "room"],
  pangrams: ["problem"],
  rankThresholds: {
    beginner: 0,
    goodStart: 2,
    movingUp: 5,
    good: 8,
    solid: 13,
    nice: 20,
    great: 28,
    amazing: 35,
    genius: 45,
    queenBee: 55
  }
});

function installFakeIndexedDb(t) {
  const previous = globalThis.indexedDB;
  const fake = createFakeIndexedDb();
  globalThis.indexedDB = fake;

  t.after(() => {
    if (previous === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = previous;
    }
  });

  return fake;
}

test("session create/resume/switch persists independent game progress", { concurrency: false }, async (t) => {
  installFakeIndexedDb(t);

  let sessionA = createInitialState(puzzleA, { source: "daily" });
  sessionA = submitWord(sessionA, "acre");
  const recordA = await saveSession(sessionA);

  let sessionB = createInitialState(puzzleB, { source: "random", seed: "seed-123" });
  sessionB = submitWord(sessionB, "bloom");
  const recordB = await saveSession(sessionB);

  const allSessions = await loadSessions();
  assert.equal(allSessions.length, 2);
  assert.deepEqual(
    allSessions.map((item) => item.sessionId).sort(),
    [recordA.sessionId, recordB.sessionId].sort()
  );

  const resumedARecord = await loadSessionById(recordA.sessionId);
  const resumedAState = createInitialState(puzzleA, resumedARecord);
  assert.equal(resumedAState.score, 1);
  assert.deepEqual(resumedAState.foundWords, ["acre"]);

  const resumedBRecord = await loadSessionById(recordB.sessionId);
  let resumedBState = createInitialState(puzzleB, resumedBRecord);
  resumedBState = submitWord(resumedBState, "problem");
  await saveSession(resumedBState);

  const switchedBackA = await loadSessionById(recordA.sessionId);
  assert.equal(switchedBackA.score, 1);
  assert.deepEqual(switchedBackA.foundWords, ["acre"]);

  const switchedBackB = await loadSessionById(recordB.sessionId);
  assert.equal(switchedBackB.score, 19);
  assert.deepEqual(switchedBackB.foundWords, ["bloom", "problem"]);
});

test("IndexedDB upgrade to v2 preserves existing sessions and adds missing stores", { concurrency: false }, async (t) => {
  const fake = installFakeIndexedDb(t);

  fake.seedDatabase(DB_NAME, 1, {
    sessions: {
      keyPath: "sessionId",
      indexes: [
        { name: "byUpdatedAt", keyPath: "updatedAt" },
        { name: "byStatus", keyPath: "status" },
        { name: "byPuzzleId", keyPath: "puzzleId" }
      ],
      records: [
        {
          sessionId: "legacy-session",
          puzzleId: "2026-02-10",
          source: "daily",
          seed: null,
          createdAt: "2026-02-10T10:00:00.000Z",
          updatedAt: "2026-02-10T10:00:00.000Z",
          foundWords: ["acre"],
          score: 1,
          rankKey: "beginner",
          hintUsage: { viewCount: 0 },
          status: "active"
        }
      ]
    }
  });

  const db = await openDb();
  assert.equal(db.version, 2);

  const dbSnapshot = fake.inspectDatabase(DB_NAME);
  assert.deepEqual(dbSnapshot.stores, ["app_meta", "puzzles", "sessions"]);

  const legacySession = await loadSessionById("legacy-session");
  assert.equal(legacySession.sessionId, "legacy-session");
  assert.equal(legacySession.score, 1);
  assert.deepEqual(legacySession.foundWords, ["acre"]);
});

test("openDb repairs broken schema when required stores are missing", { concurrency: false }, async (t) => {
  const fake = installFakeIndexedDb(t);

  fake.seedDatabase(DB_NAME, 2, {
    puzzles: {
      keyPath: "id",
      indexes: [],
      records: []
    },
    app_meta: {
      keyPath: "key",
      indexes: [],
      records: []
    }
  });

  const db = await openDb();
  assert.equal(db.version, 3);

  const snapshot = fake.inspectDatabase(DB_NAME);
  assert.deepEqual(snapshot.stores, ["app_meta", "puzzles", "sessions"]);
});

test("openDb tolerates pre-existing higher db version", { concurrency: false }, async (t) => {
  const fake = installFakeIndexedDb(t);

  fake.seedDatabase(DB_NAME, 7, {
    sessions: {
      keyPath: "sessionId",
      indexes: [
        { name: "byUpdatedAt", keyPath: "updatedAt" },
        { name: "byStatus", keyPath: "status" },
        { name: "byPuzzleId", keyPath: "puzzleId" }
      ],
      records: [
        {
          sessionId: "higher-version-session",
          puzzleId: "2026-02-10",
          source: "daily",
          seed: null,
          createdAt: "2026-02-10T10:00:00.000Z",
          updatedAt: "2026-02-10T10:00:00.000Z",
          foundWords: ["acre"],
          score: 1,
          rankKey: "beginner",
          hintUsage: { viewCount: 0 },
          status: "active"
        }
      ]
    },
    puzzles: {
      keyPath: "id",
      indexes: [],
      records: []
    },
    app_meta: {
      keyPath: "key",
      indexes: [],
      records: []
    }
  });

  const db = await openDb();
  assert.equal(db.version, 7);

  const session = await loadSessionById("higher-version-session");
  assert.equal(session.sessionId, "higher-version-session");
  assert.equal(session.score, 1);
});
