#!/usr/bin/env bash
# Classifies a change for CI: prints "light" when every changed path is on the skip list, else "full".
# Usage: scripts/ci-classify.sh <skip-list-file> < changed-paths   (one path per line)
# A missing list, no changed paths, or a change to the list or this script means "full".
set -uo pipefail
list="${1:-}"
[ -f "$list" ] || { echo full; exit 0; }
mapfile -t pats < <(tr -d '\r' <"$list" | sed -e 's/#.*//' -e 's/[[:blank:]]*$//' -e 's/^[[:blank:]]*//' | grep -v '^$')
skippable() {
  local f="$1" p hit=0
  case "$f" in scripts/ci-skip-paths|scripts/ci-classify.sh) return 1 ;; esac
  for p in "${pats[@]}"; do
    if [ "${p:0:1}" = '!' ]; then [[ "$f" == ${p:1} ]] && return 1
    else [[ "$f" == $p ]] && hit=1; fi
  done
  [ $hit = 1 ]
}
n=0
while IFS= read -r f || [ -n "$f" ]; do
  [ -n "$f" ] || continue
  n=$((n + 1))
  skippable "$f" || { echo full; exit 0; }
done
[ $n -gt 0 ] && echo light || echo full
