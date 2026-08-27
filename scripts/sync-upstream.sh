#!/usr/bin/env bash
# Re-vendor the upstream pstack tree, then surface Cursor-only references
# that need a Pi adaptation after the copy. Pins the upstream path below.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="${1:-/tmp/plugins/pstack}"
if [ ! -d "$UPSTREAM/skills" ]; then
  echo "upstream not found: $UPSTREAM (pass the path to a cursor/plugins checkout)"
  exit 1
fi

for d in skills agents docs automations; do
  rm -rf "$ROOT/$d"
  cp -r "$UPSTREAM/$d" "$ROOT/$d"
done
cp "$UPSTREAM/LICENSE" "$ROOT/LICENSE"
cp "$UPSTREAM/README.md" "$ROOT/README.upstream.md"

echo "vendored from $UPSTREAM"
"$ROOT/scripts/check-pi-isms.sh" "$ROOT"
echo "review the scanner output above; re-apply the Pi deltas, then commit."