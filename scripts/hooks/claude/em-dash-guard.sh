#!/usr/bin/env bash
# PreToolUse hook for SendMessage: refuses a message or summary that holds an em dash (U+2014), as
# the character or as its JSON escape text, so the sender rewrites it before a teammate reads it.
# Every string in the message is checked, so a structured message is covered too.
set -uo pipefail
dash=$'\xe2\x80\x94'
esc='\\[uU]2014'
text="$(jq -r '.tool_input | (.message, .summary) | .. | strings?' 2>/dev/null)" || exit 0
if [[ "$text" == *"$dash"* ]] || grep -q -- "$esc" <<<"$text"; then
  echo "Blocked by the team's hook (scripts/hooks/claude/em-dash-guard.sh): the message or its summary has an em dash (U+2014). Rewrite it with a colon, comma, period or parentheses and send it again." >&2
  exit 2
fi
exit 0
