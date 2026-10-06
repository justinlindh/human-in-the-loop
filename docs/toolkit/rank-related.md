---
tool: `node scripts/tools/rank-related.mjs --cap <n> --changed <path>... < test-files`
section: ci
who: all
covers: scripts/tools/rank-related.mjs
---
Reads candidate test files on stdin, one per line, and prints at most `n` of them, the most relevant to the changed paths first. Relevance is the import distance from the test to the nearest changed file through full-select's graph (imports, plus string literals naming a repo file): a changed test is 0, a test importing a changed file is 1, and so on. Ties go to the shorter test (`test-order.mjs` durations), then the path; a test the graph doesn't connect to the change ranks last. `scripts/test-push.sh --cap N` uses it, and smoke runs that with `HITL_SMOKE_TEST_CAP` (default 40) so a wide change still runs its nearest tests on a PR and says `CAPPED`. Exit 0, or 2 on bad arguments.
