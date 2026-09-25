---
tool: `scripts/lib/timing.js`, `scripts/lib/timing.sh`
section: timing
who: all
covers: scripts/lib/timing.js scripts/lib/timing.sh
---
The team's timing log, `~/.cache/hitl-ci/timings.jsonl`, one JSON line per event with no setup: ci-pr runs (with the PR number); each ci-local step with wall and CPU time, and each run with the load average at its start and end, the runs going and its wait for a run slot; machine-failure retries (`kind=infra`) and the vitest workers chosen (`kind=vitest`); every browser tool that launches through `scripts/lib/gl.js`; balance and build-models runs; every render-lock wait, labelled with the job; every render-check cache lookup. Each line records the worktree, branch, commit and exit code. The log never fails a run, and `HITL_TIMINGS=off` turns it off (tests do). New tools get it by calling `trackRun` from `timing.js`, or `timing_log` from `timing.sh` in shell.
