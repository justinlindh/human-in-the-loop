#!/usr/bin/env bash
# First the main guard's verdict on main's tip and any open main-red issue. Then one row per open
# pull request into main, from live GitHub data: number, merge state, what holds it
# (the awaiting-user label, or a draft), the review verdict and local-ci state for the current head,
# any GitHub check not passing, the owner and current ask (scripts/pr-owner.sh; without a record,
# the lane in the branch name, marked ?), and the title. Then the open issues waiting on the user.
# Label PRs and issues that wait on a user decision `awaiting-user` (PRs also stay drafts), so nobody
# builds against an undecided item.
# Usage: scripts/pr-status.sh
set -uo pipefail

main_sha="$(gh api "repos/{owner}/{repo}/commits/main" --jq .sha)"
guard="$(gh api "repos/{owner}/{repo}/commits/$main_sha/status" --jq '[.statuses[] | select(.context == "main-guard")][0] | if . then "\(.state): \(.description)" else "not checked yet" end')"
red="$(gh issue list --state open --label main-red --json number,title --jq '.[] | "#\(.number) \(.title)"')"
echo "main ${main_sha:0:7}, main guard ${guard}${red:+; open: $red}"
echo
printf '%-5s %-10s %-20s %-8s %-9s %-28s %-11s %-30s %s\n' PR MERGE HOLD REVIEW LOCAL-CI 'CHECKS NOT PASSING' OWNER ASK TITLE
for pr in $(gh pr list --base main --state open --limit 100 --json number --jq '.[].number' | sort -n); do
  gh pr view "$pr" --json number,title,mergeStateStatus,isDraft,labels,statusCheckRollup,comments,headRefName,headRefOid --jq '
    def ctx(n): [(.statusCheckRollup // [])[] | select(.__typename == "StatusContext" and .context == n) | .state] | first // "none";
    # The owner record (scripts/pr-owner.sh): its owner and ask, the ask marked (old) once the head moved.
    ([.comments[] | select(.body | contains("<!-- hitl-owner"))] | last | .body // "") as $rec
    | def field(k): ($rec | capture("(?m)^" + k + ": (?<v>.*)$") | .v) // "";
    (field("owner") | if . == "" then null else . end) as $owner
    | field("ask") as $ask | field("head") as $at |
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
      ($owner // ((.headRefName | split("/"))[0] + "?")),
      (if $ask == "" then "-" elif $at != "" and $at != .headRefOid then "(old) " + $ask else $ask end),
      .title ] | @tsv' \
  | awk -F'\t' '{ printf "%-5s %-10s %-20s %-8s %-9s %-28s %-11s %-30s %s\n", "#"$1, $2, $3, $4, $5, $6, $7, substr($8, 1, 30), $9 }'
done

holds="$(gh issue list --state open --label awaiting-user --limit 100 --json number,title --jq '.[] | "#\(.number)\t\(.title)"')"
echo
if [ -n "$holds" ]; then
  echo "Issues awaiting the user:"
  printf '%s\n' "$holds" | awk -F'\t' '{ printf "  %-6s %s\n", $1, $2 }'
else
  echo "Issues awaiting the user: none"
fi
