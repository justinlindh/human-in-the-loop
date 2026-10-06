---
tool: `scripts/smoke.sh [--base <ref>]` (also `npm run smoke`; GitHub's `smoke` check runs it)
section: pr
who: all
covers: scripts/smoke.sh
---
The gate a PR passes, in minutes: PRs merge on `smoke`, `commits` and the reviewer's `review` status. It runs five checks, every time, and prints a table slowest first:

- **syntax**: each `.js` and `.mjs` the change touches parses;
- **related**: the tests that import the changed JS (`scripts/test-push.sh`, the same pick as the pre-push hook); at most `HITL_SMOKE_TEST_CAP` test files (default 40), the nearest by import first (`scripts/tools/rank-related.mjs`), so a wide change runs its most relevant tests and the step prints `CAPPED` with how many it left to the release;
- **features**: `docs/features` ids match the data (`scripts/features-ids.mjs`);
- **toolkit**: every script has a `docs/toolkit` entry (`npm run toolkit -- --check`);
- **build**: a production build.

`--base` is what "touched" is measured against (default `origin/main`; the GitHub job passes the PR's base). Run `npm run smoke` in any worktree before pushing: it is the check CI will make.

Everything else, which used to run on every PR (the whole-game cases, balance, the browser and render checks, golden, the phone check, the tool self-tests), runs when a release is cut: see [release](release.md). `npm run ci` still runs the old full local run by hand (`scripts/ci-local.sh`), selecting only the self-tests a change reaches ([ci-covers](ci-covers.md)).
