---
name: spelling-bee-data-pipeline
description: Use this skill when changing dictionary or puzzle data inputs/outputs in the Spelling Bee repo, including edits under data/raw, data/dictionary-v1.json, data/dictionary-v1-meta.json, data/puzzles-v1.json, or tools/build-*.mjs. It enforces deterministic rebuilds, schema/invariant checks, and mandatory validation commands.
---

# Spelling Bee Data Pipeline

## Overview

Use this skill for all data-pipeline changes so output remains deterministic and safe for gameplay.

## When To Use

Use this skill if the request touches any of:
- `data/raw/*`
- `data/dictionary-v1.json`
- `data/dictionary-v1-meta.json`
- `data/puzzles-v1.json`
- `tools/build-dictionary.mjs`
- `tools/build-puzzles.mjs`

## Workflow

1. Identify change scope:
- Inputs only (`data/raw/*`, policy tuning).
- Generator logic (`tools/build-*.mjs`).
- Generated artifacts (`data/*.json`).

2. Rebuild outputs:
- Run `npm run build:data`.

3. Run invariant checks:
- Run `node skills/spelling-bee-data-pipeline/scripts/validate-pipeline.mjs`.

4. Run mandatory validations:
- Run `npm test`.
- Run `npm run test:e2e` (mandatory in this repo).

5. Summarize impact:
- Use `references/report-template.md` format.
- Include exact changed files and whether checks passed.

## Guardrails

- Do not hand-edit generated outputs unless explicitly requested.
- Keep puzzle IDs and dates ISO (`YYYY-MM-DD`) and contiguous.
- Keep dictionary words lowercase and alphabetic.
- Keep puzzle words valid for each letter set and center letter.
- If any invariant fails, stop and report before proposing further edits.

## Resources

- Validation script: `scripts/validate-pipeline.mjs`
- Optional full-run helper: `scripts/run-all-checks.sh`
- Reporting template: `references/report-template.md`
