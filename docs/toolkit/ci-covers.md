---
tool: `scripts/ci-covers.sh [<repo root>]` (reads changed paths on stdin; run by `scripts/ci-local.sh`)
section: ci
who: integrator, anyone adding a tool or its self-test
covers: scripts/ci-covers.sh scripts/ci-covers.test.sh
---
Chooses which tooling self-tests a PR needs. It reads the changed file paths and prints the self-tests (`*.test.sh`, `*.test.mjs`, `*.test.js`) of every toolkit entry whose `covers:` line names a changed file (or a folder holding one), every changed test, and, for a change to `ci-local.sh`, `ci-pr.sh` or `lib/ci-capacity.sh`, the runner's own tests (`ci-pr-selftest`, `ci-capacity`, `ci-keep-logs`, `ci-delta`, `ci-merge-only`). Local CI runs only those on a PR; the main guard runs every self-test on every main commit, which is where a test that a change broke without touching its tool shows up.

So an entry's `covers:` line is what decides which tests a change to a tool runs: list the tool's script and its `*.test.*` file on it (the toolkit check already requires every script to be covered).

What else a PR run leaves out, with the main guard doing it on main:
- the whole-game cases (`test:full`);
- the golden, render, stage, phone and browser checks unless the PR changes the renderer (`src/render`), the UI (`src/ui`), audio code, the page, `src/main.js` or `src/quality.js`, rendered assets (models, fonts, icons, memes), `blender/`, `scripts/lib/`, `vite.config.js` or the package files;
- the heavy checks again in the run through the PR's own `ci-local.sh` (`CI_OWN=1`): that run proves the changed runner works, and main's run already made the other checks on the same tree.

The summary table lists the steps slowest first.
