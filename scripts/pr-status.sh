#!/usr/bin/env bash
# One row per open pull request into main, from live GitHub data: number, merge state, the review
# verdict and local-ci state for the current head, any GitHub check not passing, and the title.
# Usage: scripts/pr-status.sh
set -uo pipefail

printf '%-5s %-10s %-8s %-9s %-28s %s\n' PR MERGE REVIEW LOCAL-CI 'CHECKS NOT PASSING' TITLE
for pr in $(gh pr list --base main --state open --limit 100 --json number --jq '.[].number' | sort -n); do
  gh pr view "$pr" --json number,title,mergeStateStatus,statusCheckRollup --jq '
    def ctx(n): [(.statusCheckRollup // [])[] | select(.__typename == "StatusContext" and .context == n) | .state] | first // "none";
    [ (.number | tostring),
      .mergeStateStatus,
      (ctx("review") | ascii_downcase),
      (ctx("local-ci") | ascii_downcase),
      ([(.statusCheckRollup // [])[] | select(.__typename == "CheckRun")
          | (if (.conclusion // "") == "" then .status else .conclusion end) as $c
          | select($c != "SUCCESS" and $c != "SKIPPED" and $c != "NEUTRAL")
          | "\(.name)=\($c | ascii_downcase)"] | join(",") | if . == "" then "-" else . end),
      .title ] | @tsv' \
  | awk -F'\t' '{ printf "%-5s %-10s %-8s %-9s %-28s %s\n", "#"$1, $2, $3, $4, $5, $6 }'
done
