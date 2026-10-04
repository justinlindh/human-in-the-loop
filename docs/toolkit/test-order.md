---
tool: `node scripts/tools/test-order.mjs --update [--from <vitest JSON report> | -- <vitest run arguments>]`
section: run
who: tools, tools2, sim, integrator: anyone who adds or speeds up a slow test file
covers: scripts/tools/test-order.mjs tests/tools/test-order.test.js
---
The order vitest starts test files in. `vite.config.js` sets it as the sequencer: the files in its list (1 s or more) start first, longest first, and every other file follows in vitest's own order. vitest's own order needs its duration cache, which a fresh tree (every CI run, every new worktree) doesn't have. With four workers, a 30 s file can then start last and the run waits on it alone.

`--update` runs the test:fast set on this tree (with `HITL_NO_TEST_CACHE=1`) and writes the measured durations into the list in the script itself; `-- <args>` runs other vitest arguments instead (`-- tests/sim`), and `--from report.json` reads a JSON report already made (`--reporter=json --outputFile=...`). It merges: a file the run didn't include keeps its entry, a deleted file is dropped, a file now under 1 s leaves the list. A failed run leaves the list as it was. Refresh it when a file crosses a few seconds either way, and commit the change with the test change that caused it.
