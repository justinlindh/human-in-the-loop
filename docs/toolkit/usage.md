---
tool: `npm run usage [-- --hours 5 | --since <ISO time>] [--json]`
section: run
who: team-lead
covers: scripts/usage.mjs scripts/usage-lib.mjs
---
Token use per teammate over the current 5-hour window (or `--hours`, or `--since`), from Claude Code's session logs: messages, output tokens, fresh input (read uncached, cache writes included) and cache reads, largest output first, with totals. It reads every session and subagent log under `$CLAUDE_PROJECTS` (default `~/.claude/projects`) in the project folders of this repository's checkouts (from `git worktree list`; `--prefix` takes every folder starting with a name instead), counts a streamed reply once, and names a line's teammate by its agent name (`lead` for a session without one). A subagent's replies go on their own row under the teammate whose session ran it, as `reviewer (subagents)`. Logs are streamed a line at a time, so a run over gigabytes of logs takes seconds.
