#!/usr/bin/env bash
# Merges a pull request with a merge commit, only when its current head passes both gates:
#   1. a "### Local CI: PASS" comment from scripts/ci-pr.sh naming that head;
#   2. every GitHub check passing, including the required balance, browser, commits and test.
# Usage: scripts/merge-pr.sh <pr> [--check]
#   --check  report whether the PR is ready, without merging
# Exit 0 when merged (or ready, with --check), 1 when a gate is not met, 2 on usage or lookup errors.
set -uo pipefail
pr="${1:-}"; mode="${2:-merge}"
case "$pr" in ''|*[!0-9]*) echo "usage: scripts/merge-pr.sh <pr> [--check]" >&2; exit 2 ;; esac
REQUIRED="balance browser commits test"

head="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)" || exit 2
short="${head:0:7}"
local_ok="$(gh pr view "$pr" --json comments --jq "[.comments[] | select(.body | test(\"### Local CI: PASS\") and test(\"Head \`$short\`\"))] | length")"
checks="$(gh pr checks "$pr" --json name,bucket --jq '.[] | "\(.name)=\(.bucket)"' 2>/dev/null)"

missing=""
for need in $REQUIRED; do echo "$checks" | grep -q "^$need=" || missing="$missing $need"; done
notpass="$(echo "$checks" | grep -v '=pass$' | grep -v '=skipping$' | grep -v '^$' | tr '\n' ' ')"

echo "#$pr head $short: Local CI PASS on head: $([ "$local_ok" -gt 0 ] && echo yes || echo no); GitHub checks: $(echo "$checks" | tr '\n' ' ')"
problems=""
[ "$local_ok" -gt 0 ] || problems="$problems; no Local CI PASS for this head (run scripts/ci-pr.sh $pr)"
[ -z "$missing" ] || problems="$problems; missing checks:$missing"
[ -z "$notpass" ] || problems="$problems; not passing: $notpass"
if [ -n "$problems" ]; then echo "#$pr not ready${problems}" >&2; exit 1; fi

if [ "$mode" = --check ]; then echo "#$pr ready to merge"; exit 0; fi
gh pr merge "$pr" --merge --match-head-commit "$head" || exit 1
gh pr view "$pr" --json state,mergeCommit --jq '"#'"$pr"' " + .state + " " + .mergeCommit.oid[:7]'
