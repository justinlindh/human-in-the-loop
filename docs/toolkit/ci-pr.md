---
tool: `scripts/ci-pr.sh <pr>`
section: pr
covers: scripts/ci-pr.sh
---
Local CI for a PR: it merges the head into freshly fetched `main` in a throwaway worktree and runs that tree's own `ci-local.sh`; the trust list and helper scripts come from `main` too, so the checkout you start it from doesn't matter (a clean one on `main` updates itself first). It refuses when your local copy of the branch has commits the PR lacks: push first. Posts the Local CI comment and the `local-ci` status. `--allow-bot` is for reviewed Dependabot PRs only. A verdict of **ERROR (the machine, not the code)**, with an `error` status, means steps failed twice on the machine (out of disk, memory or GPU) and nothing failed on the code: run it again later.
