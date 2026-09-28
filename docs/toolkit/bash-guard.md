---
tool: `scripts/hooks/claude/bash-guard.sh`
section: hooks
who: all
covers: scripts/hooks/claude/bash-guard.sh
---
Runs before each Bash command: blocks `pkill -f` and `pgrep -f` (stop processes by PID), `git stash` other than `list` and `show` (all worktrees share one stash stack: commit to a scratch branch or copy to your scratchpad), any push to `main` or forced push, running `scripts/ci-pr.sh <pr>` by hand (auto CI is the one path; `--allow-bot` and `HITL_MANUAL_CI=1` get through), and `gh pr create/comment/review/edit` text or body files that contain a local path.
