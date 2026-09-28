---
tool: `scripts/auto-ci.sh` (the hitl-auto-ci timer)
section: pr
who: all
covers: scripts/auto-ci.sh scripts/auto-ci.test.sh scripts/systemd/hitl-auto-ci.service scripts/systemd/hitl-auto-ci.timer
---
The one path to local CI. Every 2 minutes it starts `scripts/ci-pr.sh` on each open, non-draft PR by a trusted author whose current head has no `local-ci` status yet. It keeps at most `HITL_CI_SLOTS` (default 3) runs going, and each run is detached as its own process group. Don't run `ci-pr.sh` yourself (bash-guard refuses it): push, then watch `local-ci` on your head (`scripts/pr-status.sh`). Pending means queued or running.
- **Order:** PRs that passed review go first, then those without a verdict, then those with changes requested, each by number. A docs-only PR (the light gate) starts at once, past the cap, since it takes no CI slot.
- **A head that moves on**, a PR that closes, or one that turns draft has its run stopped (`local-ci` becomes error on the old head), and the new head is queued.
- **A head whose `local-ci` is error** (the machine failed, not the code) gets one retry. So does a head left pending for over 75 minutes with no run going (a run killed outright, or a reboot, never posts its result).
- **While the main guard has main red on a render step** (stage, render-checks, golden, golden-uncached, pose-nodraw, sweep), a PR that changes the render and no tooling (`scripts/`, `blender/checks/`) waits, and the log says why. A tooling fix still runs, and `ci-rerun` starts a held PR (a render fix for main's red). A red record older than 3 hours is ignored.
- **The `ci-rerun` label** asks for a fresh run of the current head, whatever its status. The label comes off when the run starts.
- **Its worktree's install** is what runs link to when the lockfiles match. When `npm ls` finds it stale, auto CI reinstalls it (`npm ci`) at the first pass with none of its runs going.
- **The log** is in `~/.cache/hitl-ci/auto/log`, and each run's output in `pr-<n>.log` next to it.
- **Install:** `scripts/systemd/install.sh` installs the timer with its own worktree of main (`~/.cache/hitl-ci/auto/worktree`). `journalctl --user -u hitl-auto-ci` shows it.
