---
tool: `node scripts/perf/loop-report.js [--since 24h]`
section: timing
who: perf, integrator, team-lead
covers: scripts/perf/loop-report.js
---
Where the team's time goes: total, median and p90 per tool and CI step; worktree run subtotals; wait classes and jobs; cache lookup rates; unverified repeat candidates; and the slowest runs.

`--file <timings.jsonl>` reads a frozen snapshot. `--since 24h|7d|<ISO date>` filters timestamps, `--top N` limits ranked tables, and `--json` appends JSON after the text tables. Torn JSON lines are skipped. Parent runs and child steps/tools overlap: neither worktree subtotals nor candidate durations are additive elapsed time.

Repeat candidates match recorded context, including checkout SHA, PR, worktree, branch and any recorded arguments, GL/mode, scene, seeds, bots, gate moment or other configuration fields. Only timestamp, process id, exit code and duration/load measurements are excluded. Missing fields remain distinct from recorded values. `subsequent_s` counts durations after the earliest timestamp in each group, without a grand total. Missing checkout identities have their own table, including singletons.

Every candidate has `cache_identity: "unverified"`. The timing helpers record their current checkout; `ci-pr` records its launcher, while `ci-local` changes to the test checkout, which can be a merge. PR number does not identify a tested head or gate configuration. Browser arguments are joined and truncated to 120 characters; dirty files, environment, installed dependencies and base-versus-PR gate versions are not fully recorded. Candidates justify inspection, not savings claims. Reliable run comparison needs producers to record tested tree/head/base and complete configuration/input identity, with run and parent IDs connecting steps and lookups. The report cannot recover these from historical SHA or nearby timestamps.

Wait classes separate CI admission (`ci-run`, also accepted as `ci`), GPU render (`gpu`), software render (`software`), and each unknown or missing mode. Every class remains visible even with `--top 1`. Class and job tables include count, total, median, p90, maximum and timeouts. Counts include immediate acquisitions and probes; timeout durations are included. Queue duration alone does not justify a capacity change.

Cache rates use `hit / (hit + miss)`. `cache=off` means disabled or unavailable, including hash failures, and is reported separately alongside unknown outcomes. A zero enabled denominator has a null JSON rate. Golden's whole-run and per-scene lookups are separate units. Whole-run `input` is the producer's cache hash; golden scene `input` is only a base key, with loaded-file and reference validation happening outside the logged key. Neither is inferred from checkout SHA or joined to timed runs.

Cache deduplication is a **60-second heuristic**, not exact run identity. It retains the earliest lookup and suppresses later records less than 60 seconds from it only when nonempty input/worktree and all recorded fields except timestamp/pid match. Scene, PR, outcome and configuration differences remain distinct. Missing-input records are retained. Raw counts and suppressed counts accompany the estimated lookup counts; separate real invocations with matching context can still collapse, and relaunches after a long wait can remain separate. No repeated-miss count is interpreted as repeated rendering.

JSON retains `tools`, `worktrees`, `locks`, `cache`, `repeats` and `slowest`. Corrected accounting adds `lock_classes`, `identity`, `unidentified` and `cache_note`; cache rows split by `unit` and expose `enabled`, `misses`, `disabled`, `unknown`, `raw_lookups` and `deduplicated`. Candidates expose `recorded` and `subsequent_s` instead of the unsupported `repeat_s` savings estimate. The ambiguous `repeat_misses` cache field is omitted.

Regression coverage: `npx vitest run tests/loop-report.test.js`. `LOOP_REPORT_SCRIPT` can point those fixtures at another report implementation for a negative control.
