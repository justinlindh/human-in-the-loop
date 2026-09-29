#!/usr/bin/env bash
# Posts a reviewer's verdict on a pull request: a PR review whose first line is
# "**Verdict: pass** (head <sha7>)" or "**Verdict: changes requested** (head <sha7>)", then the commit
# status "review" on that head (success for pass, failure for changes), linked to the review.
# Usage: scripts/review-verdict.sh <pr> pass|changes <body-file> [--head <sha>] [--watched <url or file>]...
#          [--superseded <url or file>]... [--code-only <why>] [--repo <owner/name>] [--as <lane>]
#   <body-file>  the review text; its first line is also the status description
#   --head       the head that was reviewed; refuses if the PR's head has moved since
#   --watched    a media file on the PR that the verdict was judged from, by URL or file name; repeat
#                for each. A pass on a PR that changes src/render, src/ui, src/audio or public/models,
#                or that has screenshots or clips, must name every media file on it
#                (scripts/lib/watched-media.sh), or it is refused (exit 1). The verdict lists them.
#   --superseded a media file on the PR that a later one replaced, named instead of watched; the
#                verdict lists it apart
#   --code-only  why the verdict was judged from the code alone; lifts that requirement and is
#                printed in the verdict
#   --repo       the repository the PR is in, one of the two this project uses (default: the one this
#                checkout points at)
#   --as         post as that lane's GitHub App bot (scripts/tools/gh-as.sh env <lane>): only this script's
#                gh calls carry the token, never the checkout under review. With no key for the lane, or no
#                gh-as.sh in this tree, it warns and posts as the default identity. HITL_GH_AS names another
#                gh-as.sh (tests).
# Exit 0 when posted, 1 when the head moved (before posting, or during it) or a pass doesn't name
# the PR's media, 2 on usage or lookup errors.
set -uo pipefail

usage="usage: scripts/review-verdict.sh <pr> pass|changes <body-file> [--head <sha>] [--watched <url or file>]... [--superseded <url or file>]... [--code-only <why>] [--repo <owner/name>] [--as <lane>]"
pr="${1:-}"; verdict="${2:-}"; body="${3:-}"
case "$pr" in ''|*[!0-9]*) echo "$usage" >&2; exit 2 ;; esac
case "$verdict" in pass|changes) ;; *) echo "$usage" >&2; exit 2 ;; esac
[ -f "$body" ] || { echo "review-verdict: no such body file: $body" >&2; exit 2; }
shift 3
want=""; repo=""; watched=(); superseded=(); why=""; as=""
while [ $# -gt 0 ]; do
  case "$1" in
    --head) want="${2:?$usage}"; shift 2 ;;
    --watched) watched+=("${2:?$usage}"); shift 2 ;;
    --superseded) superseded+=("${2:?$usage}"); shift 2 ;;
    --code-only) why="${2:?$usage}"; shift 2 ;;
    --repo) repo="${2:?$usage}"; shift 2 ;;
    --as) as="${2:?$usage}"; shift 2 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
case "$repo" in
  ''|justinlindh/human-in-the-loop|justinlindh/humanintheloopgame-site) ;;
  *) echo "review-verdict: --repo must be justinlindh/human-in-the-loop or justinlindh/humanintheloopgame-site" >&2; exit 2 ;;
esac
# The bot's token goes only to this script's own gh calls (exported here, so its helpers inherit it).
if [ -n "$as" ]; then
  gh_as="${HITL_GH_AS:-$(dirname "$0")/tools/gh-as.sh}"
  if [ -f "$gh_as" ]; then eval "$(bash "$gh_as" env "$as")"
  else echo "review-verdict: no $gh_as; posting as the default identity" >&2; fi
fi
R=(); api="repos/{owner}/{repo}"
[ -n "$repo" ] && { R=(-R "$repo"); api="repos/$repo"; }

head="$(gh pr view "${R[@]}" "$pr" --json headRefOid --jq .headRefOid)" || exit 2
if [ -n "$want" ]; then
  case "$head" in "$want"*) ;; *) echo "review-verdict: #$pr is now at ${head:0:7}, not the reviewed $want; review the new head" >&2; exit 1 ;; esac
fi
short="${head:0:7}"
W=(); for w in ${watched[@]+"${watched[@]}"}; do W+=(--watched "$w"); done
for w in ${superseded[@]+"${superseded[@]}"}; do W+=(--superseded "$w"); done
names() { "$(dirname "$0")/lib/watched-media.sh" --names "$@"; }
if [ "$verdict" = pass ]; then
  "$(dirname "$0")/lib/watched-media.sh" "$pr" ${W[@]+"${W[@]}"} ${why:+--code-only "$why"} ${repo:+--repo "$repo"}; rc=$?
  [ $rc -eq 0 ] || { [ $rc -eq 1 ] && echo "review-verdict: pass not posted" >&2; exit "$rc"; }
fi

if [ "$verdict" = pass ]; then line="**Verdict: pass** (head $short)"; state=success
else line="**Verdict: changes requested** (head $short)"; state=failure; fi
text="$(mktemp)"; trap 'rm -f "$text"' EXIT
{
  echo "$line"; echo
  [ -z "$why" ] || { echo "Judged from the code only: $why"; echo; }
  [ ${#watched[@]} -eq 0 ] || { echo "Watched: $(names "${watched[@]}")"; echo; }
  [ ${#superseded[@]} -eq 0 ] || { echo "Not watched, superseded: $(names "${superseded[@]}")"; echo; }
  cat "$body"
} >"$text"

# The head can move while the review posts: check it right before posting, and again after.
now="$(gh pr view "${R[@]}" "$pr" --json headRefOid --jq .headRefOid)"
[ "$now" = "$head" ] || { echo "review-verdict: #$pr moved to ${now:0:7} while posting; not posted" >&2; exit 1; }
gh pr review "${R[@]}" "$pr" --comment --body-file "$text" >/dev/null || exit 2
url="$(gh api "$api/pulls/$pr/reviews" --jq '[.[] | select(.body | startswith("**Verdict:"))] | last | .html_url')"

summary="$(grep -m1 -v '^[[:space:]]*$' "$body" | sed 's/^[#*> -]*//' | cut -c1-120)"
desc="$([ "$verdict" = pass ] && echo "Pass" || echo "Changes requested"): ${summary:-see the review}"
gh api "$api/statuses/$head" -f state="$state" -f context=review -f description="${desc:0:140}" \
  ${url:+-f target_url="$url"} >/dev/null || { echo "review-verdict: review posted, but the status failed" >&2; exit 2; }
echo "#$pr: review $state on $short${url:+ ($url)}"

# A push that landed while posting leaves a head nobody reviewed: mark it so it cannot pass unseen.
after="$(gh pr view "${R[@]}" "$pr" --json headRefOid --jq .headRefOid)"
if [ "$after" != "$head" ]; then
  gh api "$api/statuses/$after" -f state=failure -f context=review \
    -f description="head moved during review (reviewed $short); review the new head" >/dev/null
  echo "review-verdict: #$pr moved to ${after:0:7} while the verdict was posted; that head is marked for review" >&2
  exit 1
fi
