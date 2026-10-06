---
tool: `npm run ci` (`scripts/ci-local.sh`)
section: pr
covers: scripts/ci-local.sh
---
The same checks in the current worktree, with a summary table. It runs golden (on the GPU, one scene at a time) in the background while the other GPU steps run one after another, and runs the tooling self-tests only when a change touches `scripts/` or `.claude/` (the main guard runs them all). The `harness-uuid` step runs `tests/tools/harness-uuid.full.test.js` on a GPU slot for renderer, harness or probe changes (always in the main guard).

It keeps only what needs this machine: the GPU render checks, golden, phone-check, stage and the tooling self-tests. GitHub's own checks run the rest on the same merged code, so a PR run records those steps as covered there:
- test:fast, build and syntax (`test`);
- test:balance (`balance`; the main guard runs it itself);
- soak and lifecycle (`browser`);
- commits (`commits`);
- the main guard's cases and the renderer counts against `scripts/perf/budget.json` (`tools`).

The main guard (`CI_FULL=1`) still runs all of them here, so a red main gets its issue and bisect.

Under `ci-pr.sh`, a PR that has passed before runs only the checks whose inputs differ from its last passed tree (`CI_DELTA_FILE`, see [ci-delta](ci-delta.md)); that is what makes a head that only merged main cheap.

`test:full` (`npm run test:full`) runs the `*.full.test.js` whole-game cases that test:fast leaves out, except `harness-uuid.full.test.js`, which needs a browser and has its own GPU step. They run on main only (the main guard plays all of them on every main commit and files the issue when one breaks), not in a PR run and not on GitHub, whose two-core runner takes half an hour on one of the files. A PR run records the step as skipped. A PR run also runs only the tooling self-tests whose tool the change touches, and the render and browser checks only for a render, UI or page change; see [ci-covers](ci-covers.md).

A render step that fails is retried once, except when it hit its 600 s limit (exit 124) or timed out waiting for the render lock (75): the summary names the step and it fails without a second try.

The tooling self-tests run four at a time (`CI_SELFTEST_JOBS`), each in the background with its own log, and are collected into the summary table before the balance step. The timing log records the group as `phase=selftests`.

The tooling self-tests include `pace-browser`: browser fixtures check visible presentation records, toast queue provenance, and panel origins under the shared render lock.
The `golden-font` step checks char-lineup identity under both early and late font arrival when a change touches emotes, lineup initialization, fonts, the harness, golden or its font control. It renders on the GPU under a GPU slot, and compares exact pixels without a cache. The tests tier records it as skipped alongside the other render steps; it runs only in the full-run branch. See [golden](golden.md).

The `beats` step replays every trailer and landing beat against the sim ([trailer-beats](trailer-beats.md)) when a change touches `src/sim/`, `src/data/`, `src/save/`, `scripts/trailer/` or the capture manifests. A beat whose setup throws (its moment no longer fires) fails the step; a beat whose moment only differs from main is a note in the summary, named so video can re-check it. It runs locally only, since GitHub has no equivalent.
