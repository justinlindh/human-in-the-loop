---
tool: `scripts/lib/quiet.sh run [--minutes N] -- <command>`
section: perf
who: perf
covers: scripts/lib/quiet.sh scripts/quiet.test.sh
---
A quiet window for clean measurements (perf's bench). It asks for the window, then waits until running local CI drains, the software render lock is free and load1 is under 10 (`QUIET_LOAD`), and runs the command with the window held, for at most N minutes (default 20, at most 30). While it's held, new local CI runs (including the main guard's) and `with-render-lock.sh --software` renders wait, and say so. GPU work doesn't wait. The window's own command and everything it starts pass straight through.
- **Output:** prints how long it waited, and logs `kind=quiet` with `wait_s`, `held_s` and `exit` to the timing log.
- **Exit codes:** the command's own status, 3 when refused (two windows already held in the last 24 hours, or one held now), or 4 when the machine didn't drain within `QUIET_DRAIN_WAIT` seconds (default 1800), with the reason.
- **Status:** `scripts/lib/quiet.sh status` names the current holder.
- **A holder that dies** holds nothing back.
