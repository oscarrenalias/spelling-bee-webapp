# AGENTS.md

## Purpose
This file defines how coding agents should operate in this repository so outputs are correct, minimal, and production-safe.

## Project Context
- App type: browser-only Spelling Bee clone (no backend).
- Runtime: vanilla JS (ES modules), HTML, CSS.
- Persistence: IndexedDB.
- Data is local and generated into `data/*.json`.
- Favor deterministic behavior and small diffs.

## Non-Negotiables
- Do not break existing gameplay behavior unless explicitly requested.
- Do not edit unrelated files.
- Do not run destructive git commands (`reset --hard`, `checkout --`, etc.).
- Do not add dependencies without explicit user approval.
- Do not silently change data contracts or storage schema behavior.
- Keep all changes ASCII unless a file already requires Unicode.

## How To Work
1. Read relevant files first (`README.md`, `docs/spec.md`, touched modules/tests).
2. For non-trivial tasks, state a short plan before editing.
3. Make the smallest viable change that solves the request.
4. Prefer fixing root cause over patching symptoms.
5. Add or update tests for behavior changes.
6. Run validation commands before finalizing.

## Repo Commands (Canonical)
- Install: `npm install`
- Dev: `npm run dev`
- Unit/integration tests: `npm test`
- E2E tests: `npm run test:e2e`
- Syntax/code checks: `npm run build:code`
- Data build: `npm run build:data`
- Full build: `npm run build`

## Validation Requirements (Definition of Done)
A task is done only when all applicable checks pass:
- `npm test`
- `npm run test:e2e` (mandatory for every request)
- Any additional targeted checks relevant to the changed area (`npm run build:code`, `npm run build:data`, `npm run build`)

If any check is not run, explicitly state it and why. Skipping `npm run test:e2e` requires explicit user approval.

## Testing Rules
- Add or update tests in `tests/` for new logic and regressions.
- Prefer deterministic tests (no wall-clock or randomness without seeding/mocking).
- Keep tests close to changed behavior (unit first, integration when boundaries are involved).
- Do not delete tests to make the suite pass.

## Data + Domain Guardrails
- Preserve puzzle/data schema compatibility unless explicitly requested.
- Maintain deterministic puzzle selection and scoring/ranking semantics.
- Treat dictionary/policy updates as product changes and document impact briefly.
- For date-sensitive behavior, use explicit ISO dates in code and tests.

## Code Style Expectations
- Use clear names and small functions.
- Keep module boundaries intact (`core`, `puzzles`, `storage`, `ui`, `tools`).
- Add comments only where logic is non-obvious.
- Match existing style; avoid drive-by rewrites.

## Communication Format For Final Response
Always include:
1. What changed (concise).
2. Why it changed.
3. Validation run (exact commands + outcomes).
4. Risks/assumptions.
5. Any follow-up steps (only if needed).

## Review Mode (When User Asks For "Review")
Prioritize findings first:
- List bugs, regressions, and risks ordered by severity.
- Include file and line references.
- Note missing tests.
- Keep summary secondary.
- If no findings, explicitly say so and mention residual risk and testing gaps.
