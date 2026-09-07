#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rm -rf output
mkdir -p output
python generate.py --spec house.yaml --out output
python tests/test_reproducible.py
