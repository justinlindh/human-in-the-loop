#!/usr/bin/env bash
# The fix-loop test run: only the tests that import what this branch changed, through test-cache.
# Changed = committed since the merge base with origin/main, plus modified and untracked files.
# It falls back to the full test:fast when any changed path is not plain JS under src/, tests/ or
# scripts/ (data, docs, config and the lockfile can be read by tests without importing them), and
# says so. Run the full test:fast once before pushing; the pre-push hook does.
#   scripts/tools/test-related.sh [--list] [--files <path>...]
# --list prints the changed files and the decision only; --files names the changed files instead of
# reading them from git.
# Files no test reads (.claude, markdown, docs other than docs/effects) are ignored.
# Exit status is the test run's.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
list=0; [ "${1:-}" = --list ] && { list=1; shift; }
if [ "${1:-}" = --files ]; then shift; files="$(printf '%s\n' "$@")"; base=HEAD
else
  base="$(git merge-base origin/main HEAD 2>/dev/null || echo HEAD)"
  files="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u | while read -r f; do [ -e "$f" ] && echo "$f"; done)"
fi
full() { echo "test-related: $1: running the full test:fast"; [ "$list" = 1 ] && exit 0; exec npm run test:fast; }
[ -n "$files" ] || { echo "test-related: no changes against ${base:0:9}: nothing to run"; exit 0; }
keep=''
while read -r f; do
  case "$f" in
    docs/effects/*) full "$f is read by the effects test" ;;
    .claude/* | *.md) continue ;; # no test reads these
    docs/*) continue ;;
    src/*.js | src/*/*.js | src/*/*/*.js | tests/*.js | tests/*/*.js | tests/*/*/*.js | scripts/*.js | scripts/*.mjs | scripts/*/*.js | scripts/*/*.mjs) ;;
    *) full "$f is not plain JS under src, tests or scripts" ;;
  esac
  keep+="$f"$'\n'
done <<<"$files"
files="$(sed '/^$/d' <<<"$keep")"
[ -n "$files" ] || { echo "test-related: only files no test reads changed (docs, .claude, markdown): nothing to run"; exit 0; }
echo "test-related: $(wc -l <<<"$files") changed file(s)"
[ "$list" = 1 ] && { echo "$files"; exit 0; }
# shellcheck disable=SC2086
exec bash scripts/test-cache.sh npx vitest related --run --passWithNoTests --exclude tests/sim/balance.test.js $files
