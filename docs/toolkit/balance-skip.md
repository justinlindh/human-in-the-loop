---
tool: `scripts/ci-balance-skip-paths`
section: ci
who: integrator
covers: scripts/ci-balance-skip-paths
---
Skips the balance suite for changes that can't move balance. A pass is also recorded under a hash of the suite's inputs (the sim, its data, the balance test, the test config, the lockfile and Node), so the same inputs skip it later. `HITL_NO_CHECK_CACHE=1` turns this off.
