---
tool: `scripts/tools/changelog-auto.sh [<YYYY-MM-DD>] [--force] [--dry]` (the hitl-changelog timer, 06:30 daily)
section: run
who: video, team-lead, integrator
covers: scripts/tools/changelog-auto.sh scripts/tools/changelog-auto.test.sh scripts/tools/changelog-apply.mjs scripts/tools/changelog-digest.mjs tests/tools/changelog-apply.test.js tests/tools/changelog-digest.test.js scripts/systemd/hitl-changelog.service scripts/systemd/hitl-changelog.timer
---
Keeps the site changelog (humanintheloopgame.com/changelog/) in step with the game, one day at a time. For the day (default yesterday) it:

1. lists the player-visible PRs with `day-changes.mjs` and turns them into a plain-text digest (`changelog-digest.mjs`: titles, trimmed bodies, feature entries, still links, the `docs/effects` numbers). A day with none writes nothing;
2. runs `claude -p` on a cheap model (`CL_MODEL`, default `haiku`; read-only tools, a dollar cap) with the site's `CHANGELOG-VOICE.md`, the newest entries and the digest, and takes the one JSON entry it replies with;
3. puts the entry in the site's `changelog/entries.json` (`changelog-apply.mjs`): it checks the site's own rules (fields, the day, no em dash, no "startup", stills only), downloads a feature-media still or a PR's still to `changelog/media/<day>/` (the digest links each feature to art's `<kind>-<id>` still on the `feature-media` branch, and the prompt asks for every new object's still), drops clips and anything unreachable, and rebuilds that day's media folder, so no spare file ships. A refused draft is retried once with the reasons in the prompt;
4. runs the site's `npm test`, commits, pushes `changelog/<day>` and opens the site PR (with auto-merge on), which the reviewer and the site's checks handle like any other. The site's branch protection requires `check`, `commits` and the reviewer's `review` status, so auto-merge waits for a verdict, and the PR body asks the reviewer to check each number and claim against the game's code and `docs/effects` at that day's commit (the draft is model-written and has been wrong before).

**Idempotent.** A day has one branch and one PR. A finished day is not drafted again by the timer; `--force` drafts it afresh and replaces that day's entry: an open PR gets a new commit and a refreshed body, a merged day gets a new PR only when the text changed, and an identical redraft pushes nothing. `--dry` stops before the push and leaves the entry in the site clone.

**Failure.** No usable draft, failing site tests, a failed push or clone: the run opens an issue labelled `changelog-red` in this repository (or comments on the open one) with the log tail, and opens no PR. A passing run closes it. Logs, the digest, the raw reply and the PR body are in `~/.cache/hitl-ci/changelog-auto/<day>.*`.

Env: `CL_STATE`, `CL_GAME_ORIGIN`, `CL_SITE_ORIGIN` and `CL_SITE_REPO`, `CL_MODEL`, `CL_BUDGET` (dollars per draft, default 2), `CL_CLAUDE` and `GH` (stand-ins). Install with `scripts/systemd/install.sh` (the unit runs from the auto-CI worktree, and needs `claude`, `gh`, `node` and `jq` on the user manager's PATH). A manual run for a past day: `scripts/tools/changelog-auto.sh 2026-10-03 --force`.

The voice and the entry format are video's (`CHANGELOG-VOICE.md` in the site repository); this tool only hands them to the drafter and applies what comes back.
