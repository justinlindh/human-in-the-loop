---
tool: `scripts/ci-delta.sh <pr> <worktree> <out file> [--repo <checkout>]`
section: ci
who: integrator, perf
covers: scripts/ci-delta.sh scripts/ci-delta.test.sh
---
Writes the files in which the tree local CI is about to test differs from the tree it last passed in full for this PR (`scripts/tested-trees.sh last <pr>`), one path per line, and exits 0. It exits 1 and writes nothing when the PR has no passed tree, the repository no longer has it, or `CI_NO_DELTA=1` is set; then every check runs. `ci-pr.sh` runs it before local CI and gives the file to the main run as `CI_DELTA_FILE`; the run of the PR's own `ci-local.sh` (for a PR that changes CI) always runs everything.

The rule: a check's result is a function of its inputs, so a check none of whose inputs differ from the last passed tree passed already and is skipped. That is most of a merge-only head (a head that only merged main into a passed one): the delta is what main brought in. With a delta, `ci-local.sh` runs a gated check only when its gate matches the PR's own files and the delta (`reaches`), the whole-game tests only when they also reach a delta file (`full-select --files`), and the golden images and render checks only when the delta touches `src/`, `public/`, `blender/`, the page, `package.json`, `package-lock.json`, `vite.config.js` or the render, capture, studio and perf scripts. The main guard (`CI_FULL=1`) never uses a delta. A head that passes records its tree (`tested-trees.sh`), so each pass is the base for the next one; a failed or machine-failed run records nothing, and the next run is compared with the last pass. The run's note says how many files differed.
