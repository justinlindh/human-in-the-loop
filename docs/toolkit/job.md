---
tool: `scripts/tools/job.sh start|wait|run|tail|ls|stop|rm <name> ...`
section: run
who: all
covers: scripts/tools/job.sh scripts/tools/job.test.sh
---
Long jobs by name, in place of `until grep -q '^exit ' log` loops and PID hunting. `job.sh start <name> [--timeout <s>] [--nice <n>] -- <command...>` runs the command niced (10) under `timeout` (3600 s) in its own session, in the caller's directory, and records its PID, log and exit code; a name that is still running is refused. `job.sh wait <name> [--timeout <s>] [--tail <n>]` blocks until the job ends, prints `job <name>: exit <code> after <n>s` and the log tail, and exits with the job's code (124 for the job's own timeout, 143 for one stopped, 3 when `--timeout` expired with the job still running). `job.sh run <name> [start options] -- <command...>` is start then wait: use it as one `run_in_background` Bash call, and the harness wakes you when the job ends with the code and tail in the notice. `tail <name> [-n <lines>] [-f]` reads the log, `ls` lists jobs with state and age, `stop <name>` ends the whole process group, `rm <name>` forgets a finished one. The job outlives the call that started it, so a `wait` after a lost turn still finds the result. State is per worktree, in `<git dir>/hitl-jobs`.

    scripts/tools/job.sh run balance --timeout 1800 -- npm run balance -- --seeds 100    # with run_in_background
    scripts/tools/job.sh ls
