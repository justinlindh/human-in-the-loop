---
tool: `npm run ci` (`scripts/ci-local.sh`)
section: pr
covers: scripts/ci-local.sh
---
The same checks in the current worktree, with a summary table. It runs golden (software GL) in the background while the GPU steps run one after another, and runs the tooling self-tests only when a change touches `scripts/` or `.claude/` (the main guard runs them all).

It keeps only what needs this machine: the GPU render checks, golden, phone-check, stage, pose-nodraw and the tooling self-tests. GitHub's own checks run the rest on the same merged code, so a PR run records those steps as covered there:
- test:fast, build and syntax (`test`);
- test:balance (`balance`);
- soak and lifecycle (`browser`);
- commits (`commits`);
- the main guard's cases and the renderer counts against `scripts/perf/budget.json` (`tools`).

The main guard (`CI_FULL=1`) still runs all of them here, so a red main gets its issue and bisect.

The `golden-font` step checks char-lineup identity under both early and late font arrival when a change touches emotes, lineup initialization, fonts, the harness, golden or its font control. It uses SwiftShader and the software render lock, and compares exact pixels without a cache. The tests tier records it as skipped alongside the other render steps; it runs only in the full-run branch. See [golden](golden.md).
