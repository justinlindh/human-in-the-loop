---
tool: `scripts/heavy.sh [--timeout <s>] [--wait-max <s>] -- <command...>`
section: run
who: all
covers: scripts/heavy.sh scripts/heavy.test.sh
---
The machine's shared queue for heavy commands: balance and pair runs, full test runs, captures, render batches. It takes one of `HITL_HEAVY_SLOTS` slots (default 2, locks under `~/.cache/hitl-ci/heavy`, the same for every lane and worktree), then holds the slot while the 1-minute load is above `HITL_HEAVY_LOAD` (default three quarters of the cores) for at most `HITL_HEAVY_QUIET` seconds (180), then runs the command niced to 10 or more under `timeout` (`--timeout`, default 3600, exit 124). No slot within `--wait-max` (7200 s) exits 75. It prints how long it waited and ends with `heavy: exit <code> after <n>s`, and its exit code is the command's.

The machine runs a process manager (ananicy-cpp) that renices processes by name a moment after they start. Its default rules type `bash`, `chrome` and `chromium` as Doc-View (nice -4), `node` as BG_CPUIO (nice 16, idle I/O), and `ffmpeg` and `blender` as Heavy_CPU (nice 9), so a niced job's shells and browsers can end up above normal priority. While the command runs, `heavy.sh` puts every process under it that sits below nice 10 back at 10, every `HITL_HEAVY_RENICE` seconds (default 3; 0 turns it off). Raising a nice value needs no privilege. A process that does its work in its first seconds is not covered, and nothing outside `heavy.sh` is.

Use it instead of an uptime check or a wait loop, as one background call so the harness wakes you once with the code and the log tail:

    scripts/tools/job.sh run bal -- scripts/heavy.sh -- npm run balance -- --seeds 100    # with run_in_background

PR CI keeps its own run slots (`HITL_CI_SLOTS`); this queue is for everything a lane starts by hand.
