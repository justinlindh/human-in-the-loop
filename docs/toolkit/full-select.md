---
tool: `node scripts/tools/full-select.mjs [--base <ref>] [--files <path>...] [--why]`
section: run
who: integrator (local CI's test:full step), and anyone asking which whole-game tests a change needs
covers: scripts/tools/full-select.mjs tests/tools/full-select.test.js
---
Prints the whole-game test files (`tests/**/*.full.test.js`) a change can reach, one per line, so a PR run plays only those instead of every one. Changed files are those committed since the merge base with `--base` (default `origin/main`), plus modified and untracked ones, or the `--files` given.

A test reaches a file through its static imports and, recursively from everything it reaches, through any string literal that names a repo `.js`, `.mjs` or `.json` file: a script it spawns (`'scripts/balance.js'`, `resolve(__dirname, '../../scripts/studio/clip.mjs')`), a worker, a literal `import.meta.glob`. It also reaches the directories a wildcard `import.meta.glob` reads. A string naming another `*.test.js` file is a list entry (the test order, a runner's arguments) and isn't followed.

A changed file selects every test that reaches it. `vite.config.js`, `package.json` and `package-lock.json` select every test. A changed file no test reaches selects nothing, except a non-JavaScript file under the paths the whole-game tests read (`src/sim`, `src/data`, `src/save`, `tests`, `scripts/events`, `scripts/studio`, `scripts/tools`, `scripts/lib`, `blender/checks`), which selects every test, since a test may read data without naming it. Code a test only loads into a browser page isn't followed: `harness-uuid` runs as its own local CI step for that reason.

`--why` prints, on stderr, each selected test with the way it reaches a changed file (`src/data/table.js <- scripts/run.mjs <- tests/tools/spawns.full.test.js`). Selection on this repository takes under a second. Exit 0, or 2 for a bad argument or a `--base` git can't read.

    node scripts/tools/full-select.mjs --why
    node scripts/tools/full-select.mjs --files src/sim/rng.js
