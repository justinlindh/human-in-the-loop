#!/usr/bin/env bash
# Which tooling self-tests a change needs. Reads changed file paths on stdin and prints the test files
# (*.test.sh, *.test.mjs, *.test.js) of every toolkit entry (docs/toolkit/*.md) whose `covers:` line names
# a changed file or a folder holding one, plus every changed test file itself. Local CI runs only those
# self-tests on a PR; the main guard runs them all.
# Usage: scripts/ci-covers.sh [<repo root>] < changed-paths
set -uo pipefail
root="${1:-.}"
changed="$(cat)"
[ -n "$changed" ] || exit 0
{
grep -E '\.test\.(sh|mjs|js)$' <<<"$changed" || true
# The runner itself: the tests that load its functions or run it end to end.
if grep -qE '^scripts/(ci-local|ci-pr|lib/ci-capacity)\.sh$|^scripts/lib/ci-capacity\.sh$' <<<"$changed"; then
  printf '%s\n' scripts/ci-pr-selftest.test.sh scripts/ci-capacity.test.sh scripts/ci-keep-logs.test.sh scripts/ci-delta.test.sh scripts/ci-merge-only.test.sh
fi
for f in "$root"/docs/toolkit/*.md; do
  [ -f "$f" ] || continue
  covers="$(awk 'NR == 1 && $0 != "---" { exit } NR > 1 && $0 == "---" { exit } /^covers:/ { sub(/^covers:[ ]*/, ""); print; exit }' "$f")"
  [ -n "$covers" ] || continue
  hit=0
  for t in $covers; do
    case "$t" in
      */) grep -qE "^${t//./\\.}" <<<"$changed" && hit=1 ;;
      *) grep -Fxq -- "$t" <<<"$changed" && hit=1 ;;
    esac
    [ $hit = 1 ] && break
  done
  [ $hit = 1 ] || continue
  for t in $covers; do case "$t" in *.test.sh|*.test.mjs|*.test.js) echo "$t" ;; esac; done
done
} | LC_ALL=C sort -u
