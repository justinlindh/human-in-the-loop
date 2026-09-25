#!/usr/bin/env bash
# Carries a review pass to a new PR head that only brings in main. It finds the newest earlier head
# of the PR with a "review" success status, and compares the PR's own changes at both heads (the diff
# from their merge-base with main, as a patch-id). When they match, the new head gets "review"
# success too; otherwise nothing is posted and a reviewer has to look again.
# Usage: scripts/review-carry.sh <pr>
# Exit 0 when carried or not needed, 1 when the changes differ or no earlier pass exists, 2 on errors.
set -uo pipefail

pr="${1:-}"
case "$pr" in ''|*[!0-9]*) echo "usage: scripts/review-carry.sh <pr>" >&2; exit 2 ;; esac
REPO="$(cd "$(dirname "$0")/.." && pwd)"

read -r head base < <(gh pr view "$pr" --json headRefOid,baseRefName --jq '"\(.headRefOid) \(.baseRefName)"') || exit 2
review_state() { gh api "repos/{owner}/{repo}/commits/$1/statuses" --jq '[.[] | select(.context=="review")] | first | .state // ""'; }

[ "$(review_state "$head")" = success ] && { echo "review-carry: #$pr head ${head:0:7} already has a review pass"; exit 0; }

prev=""
for sha in $(gh api "repos/{owner}/{repo}/pulls/$pr/commits" --paginate --jq '.[].sha' | tac); do
  [ "$sha" = "$head" ] && continue
  [ "$(review_state "$sha")" = success ] && { prev="$sha"; break; }
done
[ -n "$prev" ] || { echo "review-carry: #$pr has no earlier head with a review pass"; exit 1; }

git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/ci/pr-$pr/head" "$prev" 2>/dev/null || true
own() { git -C "$REPO" diff "$(git -C "$REPO" merge-base "origin/$base" "$1")" "$1" | git patch-id --stable | cut -d' ' -f1; }
a="$(own "$prev")"; b="$(own "$head")"
if [ -n "$a" ] && [ "$a" = "$b" ]; then
  gh api "repos/{owner}/{repo}/statuses/$head" -f state=success -f context=review \
    -f description="carried from ${prev:0:7}: only merges $base" >/dev/null || exit 2
  echo "review-carry: #$pr review pass carried from ${prev:0:7} to ${head:0:7}"
  exit 0
fi
echo "review-carry: #$pr changes differ from ${prev:0:7}; a reviewer needs to look again"
exit 1
