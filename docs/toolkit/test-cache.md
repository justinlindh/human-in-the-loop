---
tool: `scripts/test-cache.sh <command...>` (behind `npm run test:fast`)
section: ci
who: all
covers: scripts/test-cache.sh scripts/test-cache.test.sh
---
`npm run test:fast` runs through it. When the same command already passed on exactly this tree, it skips the run, prints the earlier `Test Files` and `Tests` lines, and exits 0. "This tree" means the checkout's files as they are now (tracked, modified and untracked, minus ignored ones), the installed packages and the node version. That makes the usual gate before commit, then again before push, cost well under a second the second time. Only passes are cached, each for 12 hours. It never skips in CI: GitHub sets `CI`, and local CI exports `HITL_NO_TEST_CACHE=1`. Set that variable yourself to force a run, for example when chasing a flaky test. The cache lives in the repository's git directory, shared by the worktrees and keyed by content, so one worktree's pass never covers another's different tree.

`HITL_TEST_CACHE_DEBUG=1` prints the key's inputs (tree, node version, lockfile hash, arguments) and what happened (hit, ran, or an uncached run and why) to stderr. `test-cache.test.sh` turns it on and prints the lines when a case fails.
