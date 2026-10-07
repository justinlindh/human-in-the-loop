#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook: when a teammate's context passes 180k tokens (the lead's, 400k),
# asks it once to write its handoff at its next task boundary, then stays quiet until the context grows
# another 150k. It reads only the transcript's last usage record (from the end of the file). Silent
# below the threshold, and fails open on its own errors.
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
IFS=$'\t' read -r sid tp < <(jq -r '[(.session_id // ""), (.transcript_path // "")] | @tsv' <<<"$input" 2>/dev/null) || exit 0
sid="$(tr -cd 'A-Za-z0-9_-' <<<"$sid")"
[ -n "$sid" ] && [ -r "$tp" ] || exit 0
STEP=${HITL_NUDGE_STEP:-150000}
# The newest assistant record's context and the teammate it ran as.
IFS=$'\t' read -r ctx name < <(tac "$tp" 2>/dev/null | grep -m3 '"usage"' | jq -r 'select(.type == "assistant" and .message.usage)
  | [((.message.usage | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))), (.agentName // "")] | @tsv' 2>/dev/null | head -1)
[ -n "${ctx:-}" ] || exit 0
# A teammate is nudged early, at a task boundary; the lead's own session later.
if [ -n "$name" ] && [ "$name" != team-lead ]; then AT=${HITL_NUDGE_AT:-180000}; else AT=${HITL_NUDGE_AT_LEAD:-400000}; fi
state="${XDG_RUNTIME_DIR:-/tmp}/hitl-context-nudge"; mkdir -p "$state" 2>/dev/null || exit 0
f="$state/$sid"
if [ "$ctx" -lt "$AT" ]; then rm -f "$f"; exit 0; fi
last="$(cat "$f" 2>/dev/null)"
[ -n "$last" ] && [ "$ctx" -lt $((last + STEP)) ] && exit 0
echo "$ctx" >"$f"
k=$((ctx / 1000))
if [ -n "$name" ] && [ "$name" != team-lead ]; then
  echo "Context is at ${k}k tokens. When your current task is done and nothing of yours is running (not mid-plan, not waiting on a reply), write your handoff to memory/handoffs/$name.md, including an 'Open threads' section (who you're waiting on or owe a reply, and about what), then end your turn with \"handoff ready\". If you're mid-task, finish it first."
else
  echo "Context is at ${k}k tokens. Write your handoff to memory/handoffs/team-lead.md in the project's memory folder so this session can be restarted."
fi
exit 0
