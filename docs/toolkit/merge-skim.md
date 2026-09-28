---
tool: `scripts/hooks/claude/merge-skim.sh`
section: hooks
who: all
covers: scripts/hooks/claude/merge-skim.sh
---
Runs after each Bash command (PostToolUse). When the command merged `origin/main` into a checkout (`git merge ... origin/main` or `git pull ... origin main`, following a `cd <dir>` or `git -C <dir>` in the command), it lists the tooling and contract commits the merge brought in (`scripts/`, `blender/checks/`, `docs/toolkit.md`, `docs/toolkit/`, `src/contract/`), at most 10, and names any new toolkit page. That is the skim CLAUDE.md asks for at the start of a task, done for you. It is silent for every other command, for a merge that brought none of those, and for a merge it already reported. A command that doesn't mention `origin/main` or `origin main` costs about a millisecond.
