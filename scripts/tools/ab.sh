#!/usr/bin/env bash
# Runs a command on the base (merge base with origin/main, in a temporary worktree) and on this
# checkout, caches the base result per commit, and prints one diff. See docs/toolkit/ab.md.
#   scripts/tools/ab.sh [--base <ref>] [--key <text>] [--refresh] [--no-cache] [--timeout s]
#                       [--tol x] [--id field] [--ignore <regex>] [--max n] [--fail-on-diff]
#                       [--json <file>] [--force] -- <cmd...>
exec node "$(dirname "$0")/ab.mjs" "$@"
