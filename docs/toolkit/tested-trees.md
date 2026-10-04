---
tool: `scripts/tested-trees.sh record|check`
section: ci
who: integrator, perf
covers: scripts/tested-trees.sh scripts/tested-trees.test.sh
---
The trees local CI has passed in full, so the main guard can skip a tip it already knows. `ci-pr.sh` runs `tested-trees.sh record <worktree> <pr> <head> <base>` after a PASS (not the tests tier, not the light gate): it stores the worktree's tree hash (the PR head merged into the base) under `~/.cache/hitl-ci/tested-trees/<tree>` (`HITL_TESTED_TREES` moves it) and drops records older than 14 days. `check <sha>` prints the record for that commit's tree and exits 0, or exits 1 when there is none. A tree hash covers every file, so an equal tree is the same code however it was reached; a main tip that GitHub merged on top of a newer main has a different tree and is checked as before. The guard (`main-guard.sh`, tip runs only; `--sha` always runs) takes a recorded tip as green without running anything. The GitHub-covered steps (test:fast, build, balance, lifecycle, soak) were run by GitHub on the PR's own merge, which can differ from the tree that landed; the guard relies on that for a recorded tree.
