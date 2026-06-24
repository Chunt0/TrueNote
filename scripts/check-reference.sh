#!/usr/bin/env bash
# Fails if any reference-feature markers remain. Run before shipping a project
# (part of the per-project definition of done — see CLAUDE.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Match only the marker forms (REFERENCE-START/-END, REFERENCE:) — NOT the SQL
# keyword REFERENCES that appears in generated foreign-key migrations.
if grep -rnE "REFERENCE[-:]" packages/ 2>/dev/null; then
  echo ""
  echo "✗ Reference-feature markers found above. Run 'bun run eject:reference'."
  exit 1
fi
echo "✓ No reference markers — clean."
