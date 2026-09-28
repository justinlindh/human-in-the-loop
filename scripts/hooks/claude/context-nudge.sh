#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook: when a session's context passes 400k tokens, asks it once to write
# its handoff and tell team-lead, then stays quiet until the context grows another 150k. It reads only
# the transcript's last usage record (from the end of the file). Silent below the threshold, and
# fails open on its own errors.
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
IFS=$'\t' read -r sid tp < <(jq -r '[(.session_id // ""), (.transcript_path // "")] | @tsv' <<<"$input" 2>/dev/null) || exit 0
sid="$(tr -cd 'A-Za-z0-9_-' <<<"$sid")"
[ -n "$sid" ] && [ -r "$tp" ] || exit 0
AT=${HITL_NUDGE_AT:-400000}; STEP=${HITL_NUDGE_STEP:-150000}
# The newest assistant record's context and the teammate it ran as.
IFS=$'\t' read -r ctx name < <(tac "$tp" 2>/dev/null | grep -m3 '"usage"' | jq -r 'select(.type == "assistant" and .message.usage)
  | [((.message.usage | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))), (.agentName // "")] | @tsv' 2>/dev/null | head -1)
[ -n "${ctx:-}" ] || exit 0
state="${XDG_RUNTIME_DIR:-/tmp}/hitl-context-nudge"; mkdir -p "$state" 2>/dev/null || exit 0
f="$state/$sid"
if [ "$ctx" -lt "$AT" ]; then rm -f "$f"; exit 0; fi
last="$(cat "$f" 2>/dev/null)"
[ -n "$last" ] && [ "$ctx" -lt $((last + STEP)) ] && exit 0
echo "$ctx" >"$f"
k=$((ctx / 1000))
if [ -n "$name" ] && [ "$name" != team-lead ]; then
  echo "Context is at ${k}k tokens. Write your handoff to memory/handoffs/$name.md in the project's memory folder, then tell team-lead \"handoff ready\"."
else
  echo "Context is at ${k}k tokens. Write your handoff to memory/handoffs/team-lead.md in the project's memory folder so this session can be restarted."
fi
exit 0
