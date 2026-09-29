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

The tooling self-tests include `pace-browser`: browser fixtures check visible presentation records, toast queue provenance, and panel origins under the shared render lock.
