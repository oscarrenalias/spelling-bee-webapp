# Spelling Bee MVP Specification

Last updated: 2026-02-10

## 1. Objective

Build a standalone, browser-only Spelling Bee game with NYT-like behavior:

- No backend dependencies
- Strict local dictionary policy
- Daily and random puzzle play
- NYT-style validation, scoring, and rank progression
- Toggleable hints panel
- Multiple parallel sessions with persistence

## 2. Non-Goals (MVP)

- User accounts or cloud sync
- Multiplayer
- Server-side APIs
- Guaranteed 1:1 lexical parity with NYT proprietary word list

## 3. Product Decisions (Locked)

- Runtime: static browser app (no backend)
- Storage: IndexedDB
- Hints: user-toggleable show/hide
- Dictionary policy: strict and project-controlled
- Puzzle sources: local generated puzzle pack + seeded random session selection

## 4. Technical Architecture

### 4.1 Runtime and UI

- Language: JavaScript (ES modules)
- UI: custom elements + plain CSS
- Delivery: static assets (`index.html`, `src/`, `data/`)
- Dev-only tooling: Node scripts for build/watch/serve

### 4.2 Core Modules

- `GameEngine`
  - Creates initial session state and applies submissions
  - Produces deterministic state transitions
- `Validator`
  - Enforces min length, alpha-only, center-letter rule, allowed-letter set, duplicate check
- `Scoring`
  - Base score + pangram bonus
- `Ranking`
  - Maps score to rank thresholds
- `HintService`
  - Computes remaining score potential and prefix buckets for unfound words
- `PuzzleProvider`
  - Loads local puzzles and resolves daily puzzle by ISO date
- `RandomGenerator`
  - Deterministic puzzle selection from seed
- `StorageRepository`
  - IndexedDB persistence and session retrieval

### 4.3 Runtime Flow

1. Load puzzle pack from `data/puzzles-v1.json`
2. Restore the most recently updated session from IndexedDB if available
3. Otherwise start a daily session
4. On submit, validate and score via `GameEngine`
5. Persist session state to IndexedDB
6. Re-render score/rank/found words/hints/session list

## 5. Data Contracts

### 5.1 Puzzle

```json
{
  "id": "2026-02-10",
  "date": "2026-02-10",
  "centerLetter": "a",
  "outerLetters": ["c", "e", "l", "n", "r", "t"],
  "dictionaryVersion": "v1",
  "validWords": ["..."],
  "pangrams": ["..."],
  "maxScore": 0,
  "rankThresholds": {
    "beginner": 0,
    "goodStart": 0,
    "movingUp": 0,
    "good": 0,
    "solid": 0,
    "nice": 0,
    "great": 0,
    "amazing": 0,
    "genius": 0,
    "queenBee": 0
  }
}
```

### 5.2 Session Record

```json
{
  "sessionId": "uuid",
  "puzzleId": "2026-02-10",
  "source": "daily",
  "seed": null,
  "createdAt": "2026-02-10T10:00:00.000Z",
  "updatedAt": "2026-02-10T10:05:00.000Z",
  "foundWords": ["..."],
  "score": 0,
  "rankKey": "beginner",
  "hintUsage": {
    "viewCount": 0
  },
  "status": "active"
}
```

### 5.3 Hints View Model

```json
{
  "remainingTotalPoints": 123,
  "remainingWordCount": 45,
  "byPrefix2": [["ca", 4], ["co", 7]]
}
```

## 6. IndexedDB Design

- Database: `spelling_bee_db`
- Current schema version: `2`

Stores:

- `sessions` (key: `sessionId`)
  - indexes: `byUpdatedAt`, `byStatus`, `byPuzzleId`
- `puzzles` (key: `id`)
- `app_meta` (key: `key`)

Migration policy:

- Deterministic, ordered migration steps
- Existing session data must survive version upgrades

## 7. Dictionary and Puzzle Pipeline

### 7.1 Inputs

- `data/raw/dictionary-base.txt`
- `data/raw/allowlist.txt`
- `data/raw/blocklist.txt`
- `data/raw/policy.json`
- optional source files in `data/raw/sources/` (`scowl.txt`, `wordfreq.tsv`)

### 7.2 Dictionary Rules

Include:

- lowercase alphabetic words only (`a-z`)
- minimum length from policy (default `>= 4`)
- words passing optional frequency gate

Exclude (policy-driven):

- profanity/swear words
- geo terms and demonyms
- blocked pattern matches (acronyms/abbreviations-like)
- configured rare-term list

Override order:

1. Apply policy filters
2. Add `allowlist`
3. Remove `blocklist` (final authority)

### 7.3 Outputs

- `data/dictionary-v1.json`
- `data/dictionary-v1-meta.json`
- `data/puzzles-v1.json`

## 8. Puzzle Strategy

- Daily mode: select puzzle by current ISO date (`YYYY-MM-DD`) from local pack
- Fallback: first puzzle in pack when date is missing
- Random mode: deterministic puzzle selection from user seed
- Quality gates in puzzle generation:
  - minimum valid words (`MIN_WORDS`)
  - at least one pangram (`MIN_PANGRAMS`)
  - ranked by heuristic quality score

## 9. UX and Accessibility

- Keyboard-first submission flow
- Global key capture for gameplay typing
- Shuffle outer letters action
- Toggleable hints panel with ARIA expanded state
- ARIA live region feedback for submit results
- Responsive desktop/mobile layout

## 10. Test Strategy

Unit tests cover:

- validator
- scoring
- rankings
- hints
- random seed determinism

Integration tests cover:

- game-engine submit flow/state transitions
- IndexedDB migrations
- session create/resume/switch persistence

Current status:

- All existing tests pass via `npm test`