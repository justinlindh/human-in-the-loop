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
- **While the main guard has main red on a render step in two verdicts in a row** (stage, render-checks, golden, golden-uncached, sweep), a PR that changes the render and no tooling (`scripts/`, `blender/checks/`) waits, and the log says why. A tooling fix still runs, and `ci-rerun` starts a held PR (a render fix for main's red). A red record older than 3 hours is ignored.
- **Auto-merge safety net:** an open, non-draft PR by a trusted author with no `awaiting-user` label and auto-merge off gets `gh pr merge <n> --auto --merge`, once per head, and the log says whether it took. The PR-open hook (`pr-create-check.sh`) only sees a `gh pr create` typed as the tool call itself, so a PR opened from a script or a background job reaches this net instead.
- **The `ci-rerun` label** asks for a fresh run of the current head, whatever its status. The label comes off when the run starts. A rerun or a retry sets `local-ci` to pending on the head first, so `wait-for.sh` waits on it instead of reading the old result.
- **Its worktree's install** is what runs link to when the lockfiles match. When `npm ls` finds it stale, auto CI reinstalls it (`npm ci`) at the first pass with none of its runs going.
- **Machine hygiene:** each pass clears vitest's leftover `/tmp/<21-character id>/ssr` directories over an hour old. Vitest leaves one behind per run, and on a tmpfs `/tmp` they cost memory.
- **Admission floor:** no new run starts (a docs-only PR still does) while `/tmp` has under 8 GB free or the machine has under 6 GB of memory available (`AUTO_CI_TMP_MIN_GB`, `AUTO_CI_MEM_MIN_GB`); the log says which. `/tmp` is a RAM-backed tmpfs here, and a full one fails every checkout. The `hitl-tmp-clean` timer (see tmp-clean) keeps it clear.
- **The mods worktree** (`~/src/gamedev-mods`, override `AUTO_CI_MODS`) is moved to `origin/main` each pass when it has no local changes, so mods loaded from it reload on each merge.
- **The log** is in `~/.cache/hitl-ci/auto/log`, and each run's output in `pr-<n>.log` next to it.
- **Install:** `scripts/systemd/install.sh` installs the timer with its own worktree of main (`~/.cache/hitl-ci/auto/worktree`). `journalctl --user -u hitl-auto-ci` shows it.
