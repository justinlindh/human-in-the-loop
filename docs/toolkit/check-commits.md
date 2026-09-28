---
tool: `scripts/check-commits.sh`
section: pr
covers: scripts/check-commits.sh scripts/check-commits.test.sh
---
The commit check that CI runs (the GitHub `commits` check and local CI's `commits` step). The PR title and every non-merge commit must follow Conventional Commits. Every commit in the PR, merges included, must also carry no AI attribution: a `Claude-Session:` or `Co-Authored-By:` trailer, a claude.ai session link, or a "Generated with Claude" line (the same rule as the local `commit-msg` hook). This catches a commit made where that hook wasn't installed. A pushed commit can't be reworded in place, since forced pushes are refused: put the work on a fresh branch from `origin/main` with clean messages and open a new PR.
