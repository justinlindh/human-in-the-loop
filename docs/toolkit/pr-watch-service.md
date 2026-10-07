---
tool: `node scripts/tools/pr-watch-service.mjs [--once] [--dry-run] [--interval s] [--status-every min]`
section: pr
who: integrator (runs it as a systemd user service), team-lead (reads its log), every lane (gets its messages)
covers: scripts/tools/pr-watch-service.mjs tests/tools/pr-watch-service.test.js
---
One watcher for every open pull request, so no lane keeps `wait-for.sh` or `review-queue.mjs --wait` running in its own session. It reads the shared PR snapshot (`pr-snapshot.mjs`, one `gh pr list` per interval) and writes a message into a lane's team inbox (`~/.claude/teams/<team>/inboxes/<name>.json`, the entry SendMessage writes, sender `pr-watch`) only when that lane must act. An idle lane wakes on it like any teammate message. Each message names the PR, branch, head, event and next step.

- `failed`: a required check (branch protection's list, less review) failed on the head, once nothing on the head is still running. Goes to the author lane.
- `changes`: a changes-requested verdict on the head, with the reviewer and the review link. Goes to the author lane.
- `conflict`: the PR conflicts with main. The author lane merges `origin/main` in itself; the service never pushes.
- `merged` and `closed`: once, to the author lane.
- `ready`: required checks green and no verdict on the head (the review queue's READY, DEPENDABOT and OUTSIDE groups, less a head that only merges main after a changes verdict). It goes to one reviewer, alternating between `reviewer` and `reviewer2` per PR. The PR keeps that reviewer for later heads, and the other reviewer is never told.

Drafts and PRs labelled `awaiting-user` are left to the lead's own watcher. The author lane comes from the branch prefix: `integ/` is integrator, `lead/` is team-lead, `<lane>/` is that lane, and anything else goes to team-lead (Dependabot branches have no author lane). A `tools/` branch is tools2's when a `gamedev-tools2` worktree has it checked out, else tools'; a PR keeps the lane it had when first seen. The team is the newest under `~/.claude/teams/` whose config lists team-lead and both reviewers, so a relaunch is picked up without a restart.

Each message is sent once per PR, head and event; the record is `~/.cache/hitl-ci/pr-watch-state.json`. The first pass with no record writes down what is already true and sends none of it. A write is read back and tried once more if another writer replaced it; a message still unread in the inbox after 10 minutes is logged as undelivered (its lane isn't running) and never sent again. Every send, every undelivered message and a status line every `--status-every` minutes (default 10) go to `~/.cache/hitl-ci/pr-watch.log`, so a dead service shows as a log with no recent status line. `--dry-run` prints `would tell <lane>: <message>` for this pass and writes nothing. `--once` runs one pass; both read GitHub fresh rather than the snapshot. `--interval` is seconds between passes (default 60, at least 15). Exit 2 on bad options or when no team is found; 143 on SIGTERM. Env: `HITL_TEAMS_DIR`, `HITL_PR_WATCH_STATE`, `HITL_PR_WATCH_LOG`, `HITL_PR_SNAPSHOT`.

Its events agree with `wait-for.sh`'s exits on the same PRs: `failed` and `changes` where wait-for exits 2, `conflict` for 3 (with `--no-update`), `merged` for a merged 0, `closed` for 6, and `ready` for a green 0 with no verdict.
