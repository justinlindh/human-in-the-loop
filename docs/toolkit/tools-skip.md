---
tool: `scripts/ci-perf-skip-paths`, `scripts/ci-guard-skip-paths`
section: ci
who: integrator
covers: scripts/ci-perf-skip-paths scripts/ci-guard-skip-paths
---
Two skip lists for GitHub's `tools` job (`.github/workflows/ci.yml`), in the format of `scripts/ci-skip-paths` and read with `scripts/ci-classify.sh` from the base branch, never from the PR. The job's own change gate (`light` for a docs-only change) still applies first.
- `ci-perf-skip-paths`: the renderer counts against `scripts/perf/budget.json` (about 4 to 6 minutes on the two-core runner, with the Playwright install) are skipped for a change that touches nothing in `src/`, `public/`, `scripts/perf/`, `scripts/lib/`, `scripts/with-render-lock.sh`, the page, the package files, `vite.config.js`, `.github/` or the lists themselves. The main guard (`CI_FULL=1`) and pushes to main still run it.
- `ci-guard-skip-paths`: the main guard's own cases (`scripts/main-guard.test.sh`) are skipped for a change that touches nothing in `scripts/`, `.claude/`, the package files or `vite.config.js`.

The changed paths are the PR's own diff from its merge base, so a head that only merged main in is judged by the PR's own files. With both skipped, the job does no install at all. A missing list on the base branch means everything runs. The step summary names what was skipped.
