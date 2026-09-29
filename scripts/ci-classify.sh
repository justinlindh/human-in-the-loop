#!/usr/bin/env bash
# Classifies a change for CI: prints "light" when every changed path is on the skip list, "tests" when
# the rest are on the tests-only list (files only tests read: they need the tests, not the render,
# browser or balance checks), else "full".
# Usage: scripts/ci-classify.sh <skip-list-file> [<tests-only-list-file>] < changed-paths   (one path per line)
# A missing skip list, no changed paths, or a change to a list or this script means "full".
set -uo pipefail
shopt -s extglob
list="${1:-}"; tests_list="${2:-}"
[ -f "$list" ] || { echo full; exit 0; }
patterns() { [ -f "$1" ] && tr -d '\r' <"$1" | sed -e 's/#.*//' -e 's/[[:blank:]]*$//' -e 's/^[[:blank:]]*//' | grep -v '^$'; }
mapfile -t pats < <(patterns "$list")
mapfile -t tpats < <(patterns "$tests_list")
matches() { # <path> <patterns...>
  local f="$1" p hit=0; shift
  for p in "$@"; do
    if [ "${p:0:1}" = '!' ]; then [[ "$f" == ${p:1} ]] && return 1
    else [[ "$f" == $p ]] && hit=1; fi
  done
  [ $hit = 1 ]
}
config() { case "$1" in scripts/ci-skip-paths|scripts/ci-tests-only-paths|scripts/ci-classify.sh) return 0 ;; esac; return 1; }
n=0; tests=0
while IFS= read -r f || [ -n "$f" ]; do
  [ -n "$f" ] || continue
  n=$((n + 1))
  config "$f" && { echo full; exit 0; }
  matches "$f" "${pats[@]}" && continue
  [ "${#tpats[@]}" -gt 0 ] && matches "$f" "${tpats[@]}" && { tests=1; continue; }
  echo full; exit 0
done
[ $n -gt 0 ] || { echo full; exit 0; }
[ $tests = 1 ] && echo tests || echo light
