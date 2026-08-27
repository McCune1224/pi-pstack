#!/usr/bin/env bash
# Scan a skills/agents tree for Cursor-only references that break on Pi.
# Exit 0 when clean (instrumental matches only), 1 when operatives remain.
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
PAT="grok-4\.6|claude-fable|gpt-5\.6-sol|claude-opus|~/\.cursor|AskQuestion|subagent_type|Task\(model|pstack-models\.mdc"
HITS="$(grep -rlnE "$PAT" "$ROOT/skills" "$ROOT/agents" 2>/dev/null || true)"

if [ -z "$HITS" ]; then
  echo "clean: no Cursor-only references found."
  exit 0
fi

echo "Cursor-only references found (review before ship):"
echo "$HITS" | while read -r f; do
  echo "  $f"
done
# Documentational mentions (the Pi notes) are allowed; count them separately.
echo
echo "matches that are likely Pi-note documentation:"
grep -rnE "$PAT" $HITS 2>/dev/null | grep -iE "pi note|does not use|do NOT write|migrate then ignore|ignore.*mdc" || true
exit 1