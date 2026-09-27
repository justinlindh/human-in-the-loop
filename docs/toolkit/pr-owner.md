---
tool: `scripts/pr-owner.sh <pr> [--owner <name>] [--ask "<text>"]`
section: pr
who: all
covers: scripts/pr-owner.sh
---
One owner per pull request, and what is currently asked of it ("diagnose only", "don't push: under review", "waiting on art's verdict"). The record is one PR comment with a hidden marker, updated in place, so every worktree and lane sees the same one; the ask is stamped with the head it was set at. With no flags it prints the record; `--owner` sets the owner (and `--ask` the ask), `--ask` alone changes the ask. `scripts/pr-status.sh` shows both for every open PR, marks an ask `(old)` once the head has moved past it, and without a record shows the lane in the branch name with a `?`. Only the owner acts on the PR (pushes, fixes, a competing PR); anyone else routes through the owner or team-lead. Set the ask whenever it changes: that is what stops two teammates fixing the same thing. Only a record written by a login in `scripts/ci-trusted` counts, since anyone can comment on the public repo; the owner and ask are kept to one line each.
