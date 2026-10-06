---
tool: `.github/workflows/main-red.yml`, `scripts/main-red.sh`, `.github/workflows/release.yml`
section: ci
who: all (whoever sees a `main-red` issue fixes it), integrator
covers: scripts/main-red.sh scripts/main-red.test.sh
---
Main is not re-tested before a merge (branch protection no longer requires a PR to be up to date with main; the checks and the review are still required on the PR's own head), so main is verified after the fact: every push to main runs `ci` in full.

- **Release and Pages follow a green main.** `release.yml` starts when a `ci` run on main completes (`workflow_run`) and does nothing unless it succeeded and was a push. It releases the commit that run tested (`workflow_run.head_sha`), and Pages deploys the tag it makes. A manual run (`workflow_dispatch`, with a dry-run switch) still works.
- **A red main opens an issue.** `main-red.yml` runs after the same `ci` run: a failure opens one issue labelled `main-red` (title `main is red: ci failed at <sha>`), or adds a comment to the open one, naming the commit, its subject, the run and the jobs that failed. A green run on the current tip of main closes it with a comment; a green run of an older commit changes nothing, and a cancelled run reports nothing. `scripts/main-red.sh` holds the logic (the workflow checks out the default branch and runs it); `scripts/main-red.test.sh` covers it with a stand-in `gh`.

When a `main-red` issue appears, the author of the named commit fixes forward or reverts it (revert with a `revert(...)` commit through a PR), and says so on the issue. The local main guard (`scripts/main-guard.sh`) keeps judging main on this machine too; the two are independent.
