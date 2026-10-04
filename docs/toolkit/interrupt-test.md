---
tool: `node scripts/tools/interrupt-test.mjs [--after <s>] [--signal TERM|INT|HUP] [--grace <s>] [--expect <codes>] -- <command> [args...]`
section: pr
who: tools, tools2, anyone adding a tool that spawns processes
covers: scripts/tools/interrupt-test.mjs tests/tools/interrupt-test.test.js
---
The interrupted run a tool PR shows, as one command. It starts the command in a process group of its own with a scratch `TMPDIR` and `HITL_TMP`, waits `--after` seconds (default 5), sends the signal (default TERM) to the whole group, and reports: the command's exit (a code, or `signal SIGTERM` when the signal itself ended it), the processes of its tree still alive afterwards (pid and command line, then killed by pid), and the temp directories left in its scratch dir. It prints `interrupt-test: ok` and exits 0 when the command ended within `--grace` seconds (default 15) with an expected code (`--expect`, default `130,143`, or the signal itself), nothing outlived it and no temp directory was left. Exit 1 means it left something behind, ignored the signal (killed with SIGKILL after the grace) or ended with another code; exit 2 is bad options, a command that cannot start, or one that ended by itself before the interrupt, so nothing was tested.

```
node scripts/tools/interrupt-test.mjs --after 10 -- node blender/checks/stage.mjs
node scripts/tools/interrupt-test.mjs --after 3 --signal INT -- node scripts/events/pair.js --bots balanced --seeds 400
```

A tool whose children start in other process groups (`setsid`) shows up as survivors; one that makes its scratch under `TMPDIR` or `HITL_TMP` and does not remove it on a signal shows up as leftover temp dirs. The scratch dir itself is removed at the end.
