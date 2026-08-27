#!/usr/bin/env bash
# Scan the package for Cursor-only references that break on Pi.
# Exit 0 when clean, 1 when operatives remain (documentational Pi notes approved).
set -uo pipefail

ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
PAT="grok-4\.6|claude-fable|gpt-5\.6-sol|claude-opus|~/\.cursor|api2\.cursor\.sh|AskQuestion|subagent_type|Task\(model|pstack-models\.mdc|/add-plugin"
# Scan skills, agents, and the guide docs. Automations and grokbot are excluded from the package.
HITS="$(grep -rlnE "$PAT" "$ROOT/skills" "$ROOT/agents" "$ROOT/docs" 2>/dev/null || true)"

if [ -z "$HITS" ]; then
  echo "clean: no Cursor-only references found."
  exit 0
fi

echo "Cursor-only references found (review before ship):"
echo "$HITS" | while read -r f; do
  echo "  $f"
done
echo
echo "matches that are likely Pi-note documentation:"
grep -rnE "$PAT" $HITS 2>/dev/null | grep -iE "pi note|does not use|do NOT write|migrate then ignore|ignore.*mdc" || true
exit 1