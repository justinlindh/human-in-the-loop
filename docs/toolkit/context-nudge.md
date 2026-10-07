---
tool: `scripts/hooks/claude/context-nudge.sh`
section: hooks
who: all
covers: scripts/hooks/claude/context-nudge.sh
---
Runs each turn (UserPromptSubmit). When a teammate's context passes 180k tokens (the lead's own session, 400k), it asks once for the handoff at the next task boundary: when the task is done and nothing of the teammate's is running, write `memory/handoffs/<name>.md` with an "Open threads" section, then end the turn with "handoff ready" (team-lead's own session is only asked for the handoff). A teammate mid-task finishes first. It stays quiet until the context grows another 150k, and starts over after the context drops below the threshold. `HITL_NUDGE_AT` and `HITL_NUDGE_AT_LEAD` override the two thresholds. It reads only the transcript's last usage record, from the end of the file, in a few milliseconds.
