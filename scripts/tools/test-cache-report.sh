#!/usr/bin/env bash
# What test-cache did: calls, hit rate, time spent in runs, and why the misses missed.
#   scripts/tools/test-cache-report.sh [--since <hours>] [--worktree <name>]
# Reads <git common dir>/hitl-test-cache.log (one row per cached call: time, worktree, result,
# seconds, tree, previous tree of that worktree, top-level dirs that differ from it).
set -uo pipefail
since=0; wt=''
while [ $# -gt 0 ]; do
  case "$1" in
    --since) since="${2:?--since needs hours}"; shift 2 ;;
    --worktree) wt="${2:?--worktree needs a name}"; shift 2 ;;
    *) echo "test-cache-report: unknown option $1" >&2; exit 2 ;;
  esac
done
log="$(git rev-parse --git-common-dir)/hitl-test-cache.log"
[ -s "$log" ] || { echo "test-cache-report: no calls recorded yet in $log"; exit 0; }
awk -F'\t' -v since="$since" -v wt="$wt" -v now="$(date +%s)" '
  (since == 0 || $1 >= now - since * 3600) && (wt == "" || $2 == wt) {
    n++; res[$3]++; secs[$3] += $4
    if ($3 != "hit") {
      if ($6 == "-") first++
      else if ($7 == "-") same++
      else reason[$7]++
    }
  }
  END {
    if (!n) { print "test-cache-report: no calls in that window"; exit }
    runs = res["pass"] + res["fail"]
    printf "calls %d: %d hits (%.0f%%), %d passing runs, %d failing runs\n", n, res["hit"], 100 * res["hit"] / n, res["pass"], res["fail"]
    printf "time in runs: %ds (avg %ds); hits cost %ds in all\n", secs["pass"] + secs["fail"], runs ? (secs["pass"] + secs["fail"]) / runs : 0, secs["hit"]
    printf "misses: %d first in a worktree, %d on a tree already seen there (another command or an aged-out entry), %d after a change\n", first, same, runs - first - same
    print "changed dirs behind the misses (most common first):"
    for (r in reason) printf "%5d  %s\n", reason[r], r | "sort -rn | head -8"
  }' "$log"
