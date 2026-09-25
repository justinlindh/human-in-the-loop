#!/usr/bin/env bash
# Carries a review pass to a new PR head that only brings in main. It finds the newest earlier head
# of the PR with any "review" status; if that verdict is a pass, it compares the PR's own changes at
# both heads (the diff from their merge-base with main, as a patch-id). When they match, the new head
# gets "review" success too; otherwise nothing is posted and a reviewer has to look again.
# A verdict always beats a carry: nothing is posted on a head that has any review status of its own,
# and a newer changes-requested verdict is never skipped to reach an older pass.
# Usage: scripts/review-carry.sh <pr>
# Exit 0 when carried or not needed, 1 when the changes differ or no earlier pass exists, 2 on errors.
set -uo pipefail

pr="${1:-}"
case "$pr" in ''|*[!0-9]*) echo "usage: scripts/review-carry.sh <pr>" >&2; exit 2 ;; esac
REPO="$(cd "$(dirname "$0")/.." && pwd)"

read -r head base < <(gh pr view "$pr" --json headRefOid,baseRefName --jq '"\(.headRefOid) \(.baseRefName)"') || exit 2
review_state() { gh api "repos/{owner}/{repo}/commits/$1/statuses" --jq '[.[] | select(.context=="review")] | first | .state // ""'; }

own_state="$(review_state "$head")"
case "$own_state" in
  success) echo "review-carry: #$pr head ${head:0:7} already has a review pass"; exit 0 ;;
  '') ;;
  *) echo "review-carry: #$pr head ${head:0:7} has its own review verdict ($own_state); not carrying"; exit 1 ;;
esac

prev=""; prev_state=""
for sha in $(gh api "repos/{owner}/{repo}/pulls/$pr/commits" --paginate --jq '.[].sha' | tac); do
  [ "$sha" = "$head" ] && continue
  prev_state="$(review_state "$sha")"
  [ -n "$prev_state" ] && { prev="$sha"; break; }
done
[ -n "$prev" ] || { echo "review-carry: #$pr has no earlier head with a review verdict"; exit 1; }
[ "$prev_state" = success ] || { echo "review-carry: #$pr's latest verdict (${prev:0:7}) is $prev_state, not a pass; not carrying"; exit 1; }

git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/ci/pr-$pr/head" "$prev" 2>/dev/null || true
own() { git -C "$REPO" diff "$(git -C "$REPO" merge-base "origin/$base" "$1")" "$1" | git patch-id --stable | cut -d' ' -f1; }
a="$(own "$prev")"; b="$(own "$head")"
# The newest review status on the head that is a verdict, not a carry: "state<US>description", or empty.
verdict_on_head() {
  gh api "repos/{owner}/{repo}/commits/$head/statuses" \
    --jq '[.[] | select(.context=="review" and ((.description // "") | startswith("carried from") | not))] | first | if . then "\(.state)\u001f\(.description // "")" else "" end'
}
if [ -n "$a" ] && [ "$a" = "$b" ]; then
  # A verdict or a push can land while this runs: check both right before posting.
  late="$(review_state "$head")"
  [ -z "$late" ] || { echo "review-carry: #$pr head ${head:0:7} got a review verdict ($late) meanwhile; not carrying"; exit 1; }
  [ "$(gh pr view "$pr" --json headRefOid --jq .headRefOid)" = "$head" ] || { echo "review-carry: #$pr moved past ${head:0:7}; not carrying"; exit 1; }
  gh api "repos/{owner}/{repo}/statuses/$head" -f state=success -f context=review \
    -f description="carried from ${prev:0:7}: only merges $base" >/dev/null || exit 2
  # A verdict posted in the instant before the carry would now be older than it: post the verdict
  # again so it is the newest status and wins.
  v="$(verdict_on_head)"
  if [ -n "$v" ]; then
    IFS=$'\037' read -r vstate vdesc <<<"$v"
    gh api "repos/{owner}/{repo}/statuses/$head" -f state="$vstate" -f context=review -f description="$vdesc" >/dev/null || exit 2
    echo "review-carry: #$pr head ${head:0:7} got a review verdict ($vstate) during the carry; restored it"
    exit 1
  fi
  echo "review-carry: #$pr review pass carried from ${prev:0:7} to ${head:0:7}"
  exit 0
fi
echo "review-carry: #$pr changes differ from ${prev:0:7}; a reviewer needs to look again"
exit 1
