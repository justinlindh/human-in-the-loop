---
tool: `node scripts/tools/spawned-tests.mjs <path>...`
section: ci
who: all
covers: scripts/tools/spawned-tests.mjs
---
Prints the test files (`tests/**/*.test.js`, `src/**/*.test.js`) that reach any of the given files, one per line. That includes a test that runs a script by its path instead of importing it, such as `resolve('scripts/wait-for.sh')` or a spawned `.mjs`, which `vitest related` can't see. The walk is full-select's: imports, plus string literals naming a repo `.js`, `.mjs`, `.json` or `.sh` file, followed through every JS file reached. A shell script's own contents aren't followed. `test-related.sh` (and through it `test:push`) adds these tests to its run. It takes about a second for every test file. Exit 0, or 2 with no path.
