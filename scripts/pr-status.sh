#!/usr/bin/env bash
# One row per open pull request into main, from live GitHub data: number, merge state, what holds it
# (the awaiting-user label, or a draft), the review verdict and local-ci state for the current head,
# any GitHub check not passing, and the title. Then the open issues waiting on the user.
# Label PRs and issues that wait on a user decision `awaiting-user` (PRs also stay drafts), so nobody
# builds against an undecided item.
# Usage: scripts/pr-status.sh
set -uo pipefail

printf '%-5s %-10s %-19s %-8s %-9s %-28s %s\n' PR MERGE HOLD REVIEW LOCAL-CI 'CHECKS NOT PASSING' TITLE
for pr in $(gh pr list --base main --state open --limit 100 --json number --jq '.[].number' | sort -n); do
  gh pr view "$pr" --json number,title,mergeStateStatus,isDraft,labels,statusCheckRollup --jq '
    def ctx(n): [(.statusCheckRollup // [])[] | select(.__typename == "StatusContext" and .context == n) | .state] | first // "none";
    [ (.number | tostring),
      .mergeStateStatus,
      ([(if any(.labels[]; .name == "awaiting-user") then "awaiting-user" else empty end),
        (if .isDraft then "draft" else empty end)] | join(",") | if . == "" then "-" else . end),
      (ctx("review") | ascii_downcase),
      (ctx("local-ci") | ascii_downcase),
      ([(.statusCheckRollup // [])[] | select(.__typename == "CheckRun")
          | (if (.conclusion // "") == "" then .status else .conclusion end) as $c
          | select($c != "SUCCESS" and $c != "SKIPPED" and $c != "NEUTRAL")
          | "\(.name)=\($c | ascii_downcase)"] | join(",") | if . == "" then "-" else . end),
      .title ] | @tsv' \
  | awk -F'\t' '{ printf "%-5s %-10s %-19s %-8s %-9s %-28s %s\n", "#"$1, $2, $3, $4, $5, $6, $7 }'
done

holds="$(gh issue list --state open --label awaiting-user --limit 100 --json number,title --jq '.[] | "#\(.number)\t\(.title)"')"
echo
if [ -n "$holds" ]; then
  echo "Issues awaiting the user:"
  printf '%s\n' "$holds" | awk -F'\t' '{ printf "  %-6s %s\n", $1, $2 }'
else
  echo "Issues awaiting the user: none"
fi
