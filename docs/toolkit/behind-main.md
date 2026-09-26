---
tool: `scripts/hooks/claude/behind-main.sh`
section: hooks
who: all
covers: scripts/hooks/claude/behind-main.sh
---
Runs at session start and each turn: says when the checkout is behind `origin/main` and which tooling or contract commits it lacks; silent when current. It also carries rule changes to a long-running session, which read `CLAUDE.md`, its lane's brief (`.claude/agents/<lane>*.md`) and the PR template only when it started: when any of them changes on `origin/main` it shows the added lines once, with "re-read these; they apply now", and names any new `docs/toolkit/` page with its purpose.
