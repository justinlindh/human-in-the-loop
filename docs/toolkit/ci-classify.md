---
tool: `scripts/ci-classify.sh` with `scripts/ci-skip-paths`
section: ci
who: integrator
covers: scripts/ci-classify.sh scripts/ci-skip-paths scripts/ci-tests-only-paths
---
Gives docs-only changes the light gate.

A change whose files are all on `scripts/ci-skip-paths` or `scripts/ci-tests-only-paths` (files only tests read, today `src/contract/contract.md`) gets the tests tier: `ci-classify.sh <skip-list> <tests-only-list>` prints `tests`. GitHub's test job runs `test:fast` for it, while build, balance, browser and tools skip; local CI (`CI_TIER=tests`, set by `ci-pr.sh`) skips golden, render-checks, lifecycle, soak, perf and the GPU checks. Both lists and the classifier come from main, and a change to either or to `ci-classify.sh` is always full.
