---
tool: `scripts/tmp-clean.sh [--dry-run]` (the hitl-tmp-clean timer, hourly)
section: ci
who: all
covers: scripts/tmp-clean.sh scripts/tmp-clean.test.sh scripts/systemd/hitl-tmp-clean.service scripts/systemd/hitl-tmp-clean.timer
---
`/tmp` here is RAM-backed and shared with memory, so a full one fails every checkout and fills swap. Each hour this removes agent session directories (`/tmp/claude-<uid>/<project>/<session>`) and leftover `mktemp` directories (`/tmp/tmp.*`) that nothing inside has touched for 24 hours (`TMP_CLEAN_HOURS`), then runs `git worktree prune`. It only touches directories you own and never anything else under `/tmp`. `--dry-run` lists what would go. `scripts/systemd/install.sh` installs the timer; `journalctl --user -u hitl-tmp-clean` shows each run.
Auto CI also holds new runs while `/tmp` has under 8 GB free or the machine under 6 GB of memory available (`AUTO_CI_TMP_MIN_GB`, `AUTO_CI_MEM_MIN_GB`); see the auto-ci entry.
