---
tool: `scripts/test-cache.sh <command...>` (behind `npm run test:fast`)
section: ci
who: all
covers: scripts/test-cache.sh scripts/test-cache.test.sh scripts/tools/test-cache-report.sh
---
`npm run test:fast` runs through it. When the same command already passed on exactly this tree, it skips the run, prints the earlier `Test Files` and `Tests` lines, and exits 0. "This tree" means the checkout's files as they are now (tracked, modified and untracked, minus ignored ones and the files no test reads: `.claude/`, `docs/` other than `docs/effects/`, and `*.md`, so editing a doc doesn't turn a pass into a miss; `HITL_TEST_CACHE_HASH_ALL=1` counts them), the installed packages and the node version. That makes the usual gate before commit, then again before push, cost well under a second the second time. Only passes are cached, each for 12 hours. It never skips in CI: GitHub sets `CI`, and local CI exports `HITL_NO_TEST_CACHE=1`. Set that variable yourself to force a run, for example when chasing a flaky test. The cache lives in the repository's git directory, shared by the worktrees and keyed by content, so one worktree's pass never covers another's different tree.

Every cached call appends a row to `hitl-test-cache.log` in the git directory, and `scripts/tools/test-cache-report.sh [--since <hours>] [--worktree <name>]` reports the calls, the hit rate, the time spent in runs, and which top-level directories changed behind the misses. A fix loop edits code between runs, so most misses are real changes; for those use `scripts/tools/test-related.sh` ([test-related](test-related.md)).

`HITL_TEST_CACHE_DEBUG=1` prints the key's inputs (tree, node version, lockfile hash, arguments) and what happened (hit, ran, or an uncached run and why) to stderr. `test-cache.test.sh` turns it on and prints the lines when a case fails.
