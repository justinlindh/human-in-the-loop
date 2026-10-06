---
tool: `scripts/release.sh [--sha <rev>] [--dry-run]`, `.github/workflows/release.yml`
section: ci
who: team-lead (cuts releases on the owner's go), integrator
covers: scripts/release.sh scripts/release.test.sh
---
Releases happen when we choose, not on every merge. `scripts/release.sh` runs the whole suite on a commit of main and publishes it only if everything passes. It runs on this machine because the checks need its GPU.

1. It fetches `origin/main` (or takes `--sha`) and runs the main guard's full gate on that commit with nothing posted (`scripts/main-guard.sh --sha <commit> --no-post`): the whole of local CI in full mode (full vitest suite including the whole-game cases, balance, the browser lifecycle and soak checks, render checks, golden, stage, phone check, perf budget, the tool self-tests), plus a strict scene sweep.
2. **All green**: the commit gets the `release-gate` status and `release.yml` is dispatched for it. The workflow publishes only a commit that carries that status. It makes that commit the `release` branch and runs semantic-release from there (tag, GitHub release), so a main that has moved on since the suite started changes nothing, then deploys Pages from the new tag. A real release that makes no tag (nothing releasable since the last one) fails the run. The script waits for the workflow's result: a failed workflow opens or comments on a `release-red` issue, and only a published release closes an open one.
3. **Anything red, or the run could not judge** (a machine failure twice): nothing is published, and one issue labelled `release-red` opens (or takes a comment) naming the commit and the failing steps. Fix forward or revert, then run it again.
4. **`--dry-run`**: runs the suite and prints what would happen. No status, no issue; `release.yml` is asked only for its own dry run, which prints the next version and publishes nothing.

The main guard does not run on every merge (no timer); the guard script itself is the release's suite. The `smoke` check ([smoke](smoke.md)) is what a PR passes.

`release.yml` has no push trigger: it runs from `scripts/release.sh`, or from a manual dispatch with a `sha` that already carries the status (and `dry_run`, which needs no status).
