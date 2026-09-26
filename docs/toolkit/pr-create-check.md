---
tool: `scripts/hooks/claude/pr-create-check.sh`
section: hooks
who: all
covers: scripts/hooks/claude/pr-create-check.sh
---
Runs after `gh pr create`: turns on auto-merge when a non-draft PR was created without it, and flags a missing Affects section, Gates run line or `Fixes #n`.
