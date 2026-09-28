---
tool: `scripts/hooks/claude/context-nudge.sh`
section: hooks
who: all
covers: scripts/hooks/claude/context-nudge.sh
---
Runs each turn (UserPromptSubmit). When the session's context passes 400k tokens, it asks once for the handoff: write `memory/handoffs/<name>.md` in the project's memory folder, then tell team-lead "handoff ready" (team-lead's own session is only asked for the handoff). It stays quiet until the context grows another 150k, and starts over after the context drops below 400k. It reads only the transcript's last usage record, from the end of the file, in a few milliseconds.
