#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON_BIN="${PYTHON_BIN:-python}"
NODE_BIN="${NODE_BIN:-node}"

echo "== Python tests =="
"$PYTHON_BIN" -m pytest -q

echo "== JavaScript tests =="
"$NODE_BIN" --test tests/playback_core.test.mjs

echo "== JavaScript syntax =="
"$NODE_BIN" --check static/app.js

echo "== Python bytecode =="
"$PYTHON_BIN" -m compileall -q app scripts

echo "Quality checks passed."
