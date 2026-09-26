---
tool: `scripts/lib/ci-capacity.sh`
section: ci
who: integrator
covers: scripts/lib/ci-capacity.sh
---
At most `HITL_CI_SLOTS` (default 3) ci-local runs go at once on the machine, the main guard's and `npm run ci` included; a run past the cap waits and says so. Vitest gets the cores the load leaves free, shared among the runs going (2 to a third of the cores; `VITEST_WORKERS` overrides). A step that fails with a machine signature (ERR_INSUFFICIENT_RESOURCES, ENOSPC, no WebGL2, a GPU crash, a lock wait that ran out, or failing in under a second with no output) runs once more after a pause. Failing that way again records `error: machine (...)`: the run exits 3, ci-pr posts an `error` status instead of a failure, and the main guard gives no verdict instead of marking main red. Only a log's last 40 lines count. A commit the main guard can't judge twice in a row is recorded as checked and filed in a `main-unjudged` issue, and a PR whose re-run fails the same way is told the code may be the cause.
