#!/usr/bin/env bash
set -euo pipefail

echo "[1/5] build:data"
npm run build:data

echo "[2/5] pipeline invariants"
node skills/spelling-bee-data-pipeline/scripts/validate-pipeline.mjs

echo "[3/5] build:code"
npm run build:code

echo "[4/5] unit/integration tests"
npm test

echo "[5/5] e2e tests"
npm run test:e2e

echo "All pipeline checks passed."
