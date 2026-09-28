---
tool: `scripts/wait-for.sh <pr> [--merged] [--no-update] [--test "<cmd>"] [--poll <s>] [--pickup <min>] [--timeout <min>]`, or `scripts/wait-for.sh --issue <n>`
section: pr
who: all
covers: scripts/wait-for.sh
---
Run after pushing to a PR, from the worktree that has the PR's branch checked out. It reads GitHub state only and never starts local CI; the auto-CI timer does that. It waits until local-ci and every GitHub check pass on the PR's current head and exits 0, or exits 2 naming the failing check with the Local CI comment link. When the PR falls behind main or conflicts, it merges `origin/main` into the branch (a merge, never a rebase), runs the tests (`npm test`, or `--test`), pushes, and waits on the new head. A conflicting merge is aborted (exit 4) and a failing test run is left unpushed (exit 5). It refuses to update from a worktree that isn't a clean checkout of the PR's branch at its head (exit 7). `--merged` keeps waiting until the PR merges; `--no-update` only reports a PR that is behind (exit 3). It warns once when local-ci hasn't reported on the head within `--pickup` minutes (default 15; a CI slot can be busy). `--issue <n>` waits for an issue to close, for work gated on another lane's fix. Wrap long waits in `timeout`, or pass `--timeout <min>` (default 240; exit 124).
