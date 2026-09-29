---
tool: `scripts/tools/test-related.sh [--list] [--files <path>...]`
section: ci
who: all
covers: scripts/tools/test-related.sh scripts/tools/test-related.test.sh
---
The fix-loop test run: `vitest related` on what this branch changed (committed since the merge base with `origin/main`, modified, and untracked), through test-cache, excluding the balance test. It runs only the tests that import those files, so a `src/ui` edit costs about a second where `npm run test:fast` costs 40 to 60, and a change to something everything imports (`src/sim/rng.js`) still runs most of the suite. It falls back to the full `test:fast`, and says why, when any changed path is not plain JS under `src/`, `tests/` or `scripts/` (data, models, config, shell scripts and `docs/effects/` are read by tests without being imported). Files no test reads (`.claude/`, other `docs/`, markdown) are ignored, and a change of only those runs nothing. `--list` prints the decision without running; `--files` names the changed files instead of reading git. It is a loop tool: the pre-push hook still runs the full `test:fast` (cached per tree), so run that once before pushing.
