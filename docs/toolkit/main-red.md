---
tool: `.github/workflows/main-red.yml`, `scripts/main-red.sh`
section: ci
who: all (whoever sees a `main-red` issue fixes it)
covers: scripts/main-red.sh scripts/main-red.test.sh
---
A PR merges on its own head's checks without being re-tested against main, so a push to main runs `ci` (the `smoke` job) again, and a failure there is reported at once. `main-red.yml` runs when a `ci` run on main finishes: a failure opens one issue labelled `main-red` (title `main is red: ci failed at <sha>`), or adds a comment to the open one, naming the commit, its subject, the run and the jobs that failed. A green run on the current tip of main closes it with a comment; a green run of an older commit changes nothing, and a cancelled run reports nothing. It only touches the issue it opened itself, which carries a hidden `<!-- main-red:ci -->` line; an issue under the same label from another source (the main guard's) is left alone. `scripts/main-red.sh` holds the logic (the workflow checks out the default branch and runs it); `scripts/main-red.test.sh` covers it with a stand-in `gh`.

The author of the named commit fixes forward or reverts it (a `revert(...)` commit through a PR) and says so on the issue. The whole suite is not part of this: it runs when a release is cut and reports in a `release-red` issue ([release](release.md)).
