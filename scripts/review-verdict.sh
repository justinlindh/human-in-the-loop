#!/usr/bin/env bash
# Posts a reviewer's verdict on a pull request: a PR review whose first line is
# "**Verdict: pass** (head <sha7>)" or "**Verdict: changes requested** (head <sha7>)", then the commit
# status "review" on that head (success for pass, failure for changes), linked to the review.
# Usage: scripts/review-verdict.sh <pr> pass|changes <body-file> [--head <sha>]
#   <body-file>  the review text; its first line is also the status description
#   --head       the head that was reviewed; refuses if the PR's head has moved since
# Exit 0 when posted, 1 when the head moved, 2 on usage or lookup errors.
set -uo pipefail

usage="usage: scripts/review-verdict.sh <pr> pass|changes <body-file> [--head <sha>]"
pr="${1:-}"; verdict="${2:-}"; body="${3:-}"
case "$pr" in ''|*[!0-9]*) echo "$usage" >&2; exit 2 ;; esac
case "$verdict" in pass|changes) ;; *) echo "$usage" >&2; exit 2 ;; esac
[ -f "$body" ] || { echo "review-verdict: no such body file: $body" >&2; exit 2; }
shift 3
want=""
while [ $# -gt 0 ]; do
  case "$1" in --head) want="${2:?$usage}"; shift 2 ;; *) echo "$usage" >&2; exit 2 ;; esac
done

head="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)" || exit 2
if [ -n "$want" ]; then
  case "$head" in "$want"*) ;; *) echo "review-verdict: #$pr is now at ${head:0:7}, not the reviewed $want; review the new head" >&2; exit 1 ;; esac
fi
short="${head:0:7}"

if [ "$verdict" = pass ]; then line="**Verdict: pass** (head $short)"; state=success
else line="**Verdict: changes requested** (head $short)"; state=failure; fi
text="$(mktemp)"; trap 'rm -f "$text"' EXIT
{ echo "$line"; echo; cat "$body"; } >"$text"

# The head can move while the review posts; check again right before and after.
now="$(gh pr view "$pr" --json headRefOid --jq .headRefOid)"
[ "$now" = "$head" ] || { echo "review-verdict: #$pr moved to ${now:0:7} while posting; not posted" >&2; exit 1; }
gh pr review "$pr" --comment --body-file "$text" >/dev/null || exit 2
url="$(gh api "repos/{owner}/{repo}/pulls/$pr/reviews" --jq '[.[] | select(.body | startswith("**Verdict:"))] | last | .html_url')"

summary="$(grep -m1 -v '^[[:space:]]*$' "$body" | sed 's/^[#*> -]*//' | cut -c1-120)"
desc="$([ "$verdict" = pass ] && echo "Pass" || echo "Changes requested"): ${summary:-see the review}"
gh api "repos/{owner}/{repo}/statuses/$head" -f state="$state" -f context=review -f description="${desc:0:140}" \
  ${url:+-f target_url="$url"} >/dev/null || { echo "review-verdict: review posted, but the status failed" >&2; exit 2; }
echo "#$pr: review $state on $short${url:+ ($url)}"
