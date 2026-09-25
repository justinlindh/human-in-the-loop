---
tool: `npm run ci` (`scripts/ci-local.sh`)
section: pr
covers: scripts/ci-local.sh
---
The same checks in the current worktree, with a summary table. It runs golden (software GL) in the background while the GPU steps run one after another, and runs the tooling self-tests only when a change touches `scripts/` or `.claude/` (the main guard runs them all).
