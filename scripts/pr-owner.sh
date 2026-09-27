#!/usr/bin/env bash
# One owner per pull request, and what is currently asked of it. The record is one PR comment
# carrying a hidden marker, so every worktree and lane sees the same one; pr-status.sh shows it.
#   scripts/pr-owner.sh <pr>                                show the record
#   scripts/pr-owner.sh <pr> --owner <name> [--ask "<text>"]  set it (the ask is stamped with the head)
#   scripts/pr-owner.sh <pr> --ask "<text>"                 change the ask, keeping the owner
# Only the owner acts on the PR (pushes, fixes, a competing PR); anyone else routes through them or
# team-lead. An ask names what is expected now: "diagnose only", "don't push: under review",
# "waiting on art's verdict". Without a record, the owner is the lane in the branch name.
set -euo pipefail
MARK='<!-- hitl-owner'
pr="${1:?usage: scripts/pr-owner.sh <pr> [--owner <name>] [--ask \"<text>\"]}"; shift
owner=''; ask=''; set_ask=0
while [ $# -gt 0 ]; do
  case "$1" in
    --owner) owner="${2:?--owner needs a name}"; shift 2 ;;
    --ask) ask="${2-}"; set_ask=1; shift 2 ;;
    *) echo "pr-owner: unknown option $1" >&2; exit 2 ;;
  esac
done
view="$(gh pr view "$pr" --json headRefName,headRefOid,comments)"
head="$(jq -r .headRefOid <<<"$view")"
branch="$(jq -r .headRefName <<<"$view")"
record="$(jq -r --arg m "$MARK" '[.comments[] | select(.body | contains($m))] | last // empty | .body' <<<"$view")"
field() { sed -n "s/^$1: //p" <<<"$record" | head -1; }
cur_owner="$(field owner)"; cur_ask="$(field ask)"; cur_head="$(field head)"
if [ -z "$owner" ] && [ "$set_ask" = 0 ]; then
  echo "#$pr owner: ${cur_owner:-${branch%%/*} (from the branch)}"
  echo "#$pr ask: ${cur_ask:--}${cur_head:+ (set at ${cur_head:0:7}${cur_head:+$([ "$cur_head" != "$head" ] && echo ", head is now ${head:0:7}")})}"
  exit 0
fi
owner="${owner:-${cur_owner:-${branch%%/*}}}"
[ "$set_ask" = 1 ] || ask="$cur_ask"
body="$(printf '%s\nowner: %s\nask: %s\nhead: %s\n-->\n**Owner:** %s. **Ask:** %s (set at %s)\n' "$MARK" "$owner" "$ask" "$head" "$owner" "${ask:--}" "${head:0:7}")"
id="$(gh api "repos/{owner}/{repo}/issues/$pr/comments" --paginate --jq ".[] | select(.body | contains(\"$MARK\")) | .id" | tail -1)"
if [ -n "$id" ]; then gh api -X PATCH "repos/{owner}/{repo}/issues/comments/$id" -f body="$body" >/dev/null
else gh pr comment "$pr" --body "$body" >/dev/null; fi
echo "#$pr owner: $owner; ask: ${ask:--} (at ${head:0:7})"
