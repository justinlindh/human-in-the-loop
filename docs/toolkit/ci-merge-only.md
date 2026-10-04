---
tool: `scripts/ci-merge-only.sh <pr> <head> <base> [--repo <checkout>]`
section: ci
who: integrator, perf
covers: scripts/ci-merge-only.sh scripts/ci-merge-only.test.sh
---
Prints `1` when a PR head only merged its base into the PR's earlier tested head (the PR's own diff from the base is the same patch-id), `0` when the PR's own changes differ, and `na` when there is no earlier head with a local-ci status or anything could not be read. `ci-pr.sh` records it as `merge_only=` on each `kind=run tool=ci-pr` line of the timing log (`~/.cache/hitl-ci/timings.jsonl`), so merge-only heads can be timed apart from new work (#1343's under-2-minutes target).
