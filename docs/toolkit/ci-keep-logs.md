---
tool: `scripts/ci-keep-logs.test.sh`
section: pr
covers: scripts/ci-keep-logs.test.sh
---
Cases for keeping a failed local CI step's log. Under `ci-pr.sh`, a step that fails (on the code or the machine) has its full log copied to `~/.cache/hitl-ci/failed/pr<n>-<head7>/<step>.log` (`-own` after the head for the PR's own local-CI run), and the Local CI comment shows the step's last 30 lines and that path. Passing steps keep nothing. Kept logs older than `CI_KEEP_DAYS` (default 4) are pruned at the start of each run. `ci-local.sh` keeps logs only when `CI_KEEP_DIR` is set, so `npm run ci` is unchanged.
