---
tool: `scripts/release.sh [--sha <rev>] [--dry-run]`, `.github/workflows/release.yml`
section: ci
who: team-lead (cuts releases on the owner's go), integrator
covers: scripts/release.sh scripts/release.test.sh
---
Releases happen when we choose, not on every merge. `scripts/release.sh` runs the whole suite on a commit of main and publishes it only if everything passes. It runs on this machine because the checks need its GPU.

1. It fetches `origin/main` (or takes `--sha`) and runs the main guard's full gate on that commit with nothing posted (`scripts/main-guard.sh --sha <commit> --no-post`): the whole of local CI in full mode (full vitest suite including the whole-game cases, balance, the browser lifecycle and soak checks, render checks, golden, stage, phone check, perf budget, the tool self-tests), plus a strict scene sweep.
2. **All green**: the commit gets the `release-gate` status and `release.yml` is dispatched for it. The workflow publishes only a commit that carries that status; it then runs semantic-release (tag, GitHub release) and deploys Pages from the new tag. An open `release-red` issue is closed.
3. **Anything red, or the run could not judge** (a machine failure twice): nothing is published, and one issue labelled `release-red` opens (or takes a comment) naming the commit and the failing steps. Fix forward or revert, then run it again.
4. **`--dry-run`**: runs the suite and prints what would happen. No status, no issue; `release.yml` is asked only for its own dry run, which prints the next version and publishes nothing.

The main guard no longer runs on every merge (its timer is off); the guard script itself is the release's suite. The `smoke` check ([smoke](smoke.md)) is what a PR passes.

`release.yml` has no push trigger: it runs from `scripts/release.sh`, or from a manual dispatch with a `sha` that already carries the status (and `dry_run`, which needs no status).
