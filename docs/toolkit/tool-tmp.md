---
tool: `scripts/tools/tmp.mjs` (`toolTmp`, `makeTemp`)
section: run
who: tools, tools2, anyone writing a script under blender/checks, scripts/tools, scripts/events or scripts/studio
covers: scripts/tools/tmp.mjs tests/tools/tool-tmp.test.js
---
Where tools keep scratch files: on disk under `HITL_TMP`, default `~/.cache/hitl-ci/tmp`, never `/tmp`. `/tmp` is RAM-backed with a cap on inodes, and leftover worktrees and scratch files there starve browsers (`ERR_INSUFFICIENT_RESOURCES`). `toolTmp()` returns the directory and creates it if needed. `makeTemp('name-')` makes a fresh directory in it, like `mkdtempSync`, and the caller removes it. A shell script uses `mkdir -p "${HITL_TMP:=$HOME/.cache/hitl-ci/tmp}"; tmp="$(mktemp -d -p "$HITL_TMP")"`.

A test that counts what a tool leaves behind gives the tool its own `HITL_TMP` (from `makeTemp`), and can point `TMPDIR` at a second empty directory to assert the tool writes nothing to the system temp directory (worktree.test.js and pair.test.js do). `tests/tools/tool-tmp.test.js` fails when a file in those paths imports `tmpdir` from `node:os`, calls `mktemp` without `-p`, or names a `/tmp` path. The one exception is `worktree.mjs`, which also sweeps the system temp directory for trees an older checkout left there.
