#!/usr/bin/env bash
# Waits on a pull request after a push, from GitHub state only: it never starts local CI (the auto-CI
# timer does). Main does not require a branch to be up to date, so a PR that is only behind main waits
# for its checks and merges as it is. It merges origin/main into the PR's branch in this worktree (merge,
# never rebase), runs the tests, pushes, and waits on the new head in two cases only: the PR conflicts
# with main, or a check failed while the branch is behind main (once, in case main fixes it). --update
# merges main in whenever the PR is behind.
#
# Usage: scripts/wait-for.sh <pr> [--merged] [--update | --no-update] [--test "<cmd>"] [--poll <s>]
#                                  [--pickup <min>] [--timeout <min>]
#        scripts/wait-for.sh --issue <n> [--poll <s>] [--timeout <min>]
#   --repo       the PR's or issue's repository (owner/name), for the site repository; run it from a
#                checkout of that repository
#   --merged     keep waiting after the checks pass, until the PR merges
#   --update     merge main into the branch whenever the PR is behind it, not only on a conflict
#   --no-update  never merge main in: report a conflicting PR (exit 3) and a failing check as they are
#   --test       the test command gating the push (default: `nice -n 10 npm run test:push`, the tests
#                related to the branch's changes, where package.json has that script, else npm test;
#                the PR's required GitHub test check runs the whole suite on the pushed head)
#   --pickup     warn once when local-ci hasn't reported on the head after this many minutes (default 15)
#   --issue      wait until an issue closes (or, given a pull request number, until it merges or closes)
# Green means every status the base branch requires (branch protection, less review) passed and no
# GitHub check is still running; without access to the protection rules, local-ci stands in.
# Exit: 0 green (or merged, or the issue closed); 2 a check failed; 3 conflicting with main under
# --no-update; 4 merging main conflicts; 5 the tests failed after merging main; 6 the PR was closed;
# 7 this worktree isn't on the PR's branch at its head, or is no longer on the branch the wait started on when a
#   merge or push is due; 8 pushing the merge of main failed; 124 timed out.
set -uo pipefail

pr="" issue="" repo="" merged=0 update=auto test_cmd="" poll=60 pickup=15 timeout=240
while [ $# -gt 0 ]; do
  case "$1" in
    --merged) merged=1 ;;
    --update) update=always ;;
    --no-update) update=never ;;
    --test) test_cmd="$2"; shift ;;
    --poll) poll="$2"; shift ;;
    --pickup) pickup="$2"; shift ;;
    --timeout) timeout="$2"; shift ;;
    --issue) issue="$2"; shift ;;
    --repo) repo="$2"; shift ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) pr="$1" ;;
  esac
  shift
done
[ -n "$pr" ] || [ -n "$issue" ] || { echo "usage: scripts/wait-for.sh <pr> | --issue <n>" >&2; exit 64; }

R=(); api="repos/{owner}/{repo}"
[ -n "$repo" ] && { R=(-R "$repo"); api="repos/$repo"; }
start=$(date +%s)
say() { echo "[wait-for $(date +%H:%M:%S)] $*"; }
# The branch this worktree was on when the wait began. Before every merge and push it must still be
# on it: someone switching the worktree meanwhile would have main merged into, and pushed from, other work.
started_on="$(git branch --show-current 2>/dev/null)"
still_on_branch() { # <what>: exits 7 naming both branches when the worktree has moved
  local now; now="$(git branch --show-current 2>/dev/null)"
  [ "$now" = "$started_on" ] && return 0
  say "this worktree was on ${started_on:-a detached HEAD} when the wait began and is on ${now:-a detached HEAD} now; not $1"
  exit 7
}
timed_out() { [ $(( $(date +%s) - start )) -ge $(( timeout * 60 )) ]; }

if [ -n "$issue" ]; then
  while :; do
    state="$(gh issue view "${R[@]}" "$issue" --json state | jq -r .state)"
    # A pull request number works too: GitHub reports a merged one as MERGED, not CLOSED.
    [ "$state" = CLOSED ] && { say "issue #$issue closed"; exit 0; }
    [ "$state" = MERGED ] && { say "#$issue merged"; exit 0; }
    timed_out && { say "timed out waiting for issue #$issue to close"; exit 124; }
    sleep "$poll"
  done
fi

# The reviewer's last verdict review on the PR, as `<changes|pass> <head sha it judged> <login> <url>` (the
# verdict is in the review body; the review status on a head is the other record of it).
last_verdict() {
  # A verdict review's body starts `**Verdict: pass**` or `**Verdict: changes requested**` (review-verdict.sh).
  gh api "$api/pulls/$pr/reviews?per_page=100" --jq '[.[] | select((.body // "") | test("^\\*\\*Verdict: (pass|changes requested)\\*\\*"))] | last // empty
    | "\(if (.body | startswith("**Verdict: changes requested")) then "changes" else "pass" end) \(.commit_id // "-") \(.user.login) \(.html_url)"' 2>/dev/null
}
is_merge() { # <sha> <branch>
  git cat-file -e "$1^{commit}" 2>/dev/null || git fetch -q origin "$2" 2>/dev/null
  [ "$(git rev-list --parents -n1 "$1" 2>/dev/null | wc -w)" -gt 2 ]
}
# True when the head differs from <sha> only by merges of main: no commit of the PR's own since.
main_merges_only() { # <sha> <head> <branch>
  git cat-file -e "$1^{commit}" 2>/dev/null || git fetch -q origin "$3" 2>/dev/null
  git cat-file -e "$1^{commit}" 2>/dev/null && git cat-file -e "$2^{commit}" 2>/dev/null || return 1
  git fetch -q origin main 2>/dev/null
  git rev-parse -q --verify origin/main >/dev/null 2>&1 || return 1
  git merge-base --is-ancestor "$1" "$2" 2>/dev/null || return 1
  [ -z "$(git rev-list --no-merges "$1..$2" ^origin/main 2>/dev/null)" ]
}

local_ci_link() {
  gh api "$api/issues/$pr/comments?per_page=100" \
    | jq -r '[.[] | select(.body | startswith("### Local CI"))] | last | .html_url // empty'
}

# Merges origin/main into the PR's branch here, tests, and pushes. Refuses unless this worktree is on the
# PR's branch at its current head with a clean tree, so it never pushes someone else's state.
update_branch() {
  local branch="$1" head="$2"
  if [ "$(git branch --show-current)" != "$branch" ] || [ "$(git rev-parse HEAD)" != "$head" ] || [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    say "this worktree isn't a clean checkout of $branch at ${head:0:8}; update it by hand"
    exit 7
  fi
  still_on_branch "merging main"
  git fetch -q origin main
  if ! git merge -q --no-edit origin/main; then
    git merge --abort
    say "merging origin/main into $branch conflicts; resolve it by hand"
    exit 4
  fi
  if [ -z "$test_cmd" ]; then
    if jq -e '.scripts["test:push"]' package.json >/dev/null 2>&1; then test_cmd="nice -n 10 npm run test:push"; else test_cmd="npm test"; fi
  fi
  say "merged origin/main; running: $test_cmd"
  local log; log="$(mktemp)"
  if ! bash -c "$test_cmd" > "$log" 2>&1; then
    tail -20 "$log"
    say "tests failed after merging main; the merge is committed locally but not pushed"
    exit 5
  fi
  rm -f "$log"
  still_on_branch "pushing (the merge stays committed on $started_on)"
  # Explicit about where it goes, so a branch pushed without tracking (no upstream) still updates.
  local perr; perr="$(mktemp)"
  if ! git push -q -u origin "HEAD:refs/heads/$started_on" 2>"$perr"; then
    cat "$perr"; rm -f "$perr"
    say "pushing $started_on failed; the merge stays committed locally"
    exit 8
  fi
  rm -f "$perr"
  say "pushed $(git rev-parse --short HEAD)"
}

# Sets json to the PR's state and src to where it came from: the shared snapshot (one gh pr list per
# interval for every watcher), or gh pr view when live=1, for a PR that is no longer open, another
# repository, or an unreadable snapshot. The snapshot can be minutes old, so every decision that ends
# the wait or updates the branch is taken again on a live read (see confirm).
live=0
read_pr() {
  json="" src=snapshot
  if [ "$live" = 0 ] && [ -z "$repo" ] && [ "${HITL_WAIT_SNAPSHOT:-1}" != 0 ]; then
    json="$(node "$(dirname "$0")/tools/pr-snapshot.mjs" --pr "$pr" 2>/dev/null | jq -ce .pr)" || json=""
  fi
  [ -n "$json" ] && return 0
  src=live
  json="$(gh pr view "${R[@]}" "$pr" --json state,headRefOid,headRefName,baseRefName,mergeStateStatus,mergeable,statusCheckRollup,labels,isDraft,autoMergeRequest)"
}
# Cancelled check runs that are not a failure. GitHub can start two runs of a workflow for one head,
# and the workflow's concurrency cancels one of them: a cancelled job in a run that a newer run of the
# same workflow for this head replaced is waited past. A cancelled job in the newest run, once nothing
# for the head is running, gets one `gh run rerun --failed` per head (a marker file holds it across
# restarted watchers); cancelled again after that, it fails. Returns 0 to keep waiting, 1 to fail.
RERUNS="${HITL_WAIT_RERUNS:-$HOME/.cache/hitl-ci/wait-for-reruns}"
cancel_said=""
handle_cancelled() {
  local runs verdict marker="$RERUNS/$pr-$head"
  runs="$(gh run list "${R[@]}" --commit "$head" --json databaseId,status,workflowName --limit 50 2>/dev/null)" || return 1
  # One line per cancelled check: its name, its run, and the newest run of that workflow for the head.
  verdict="$(jq -r --argjson runs "$runs" '
    [.statusCheckRollup[]? | select(.__typename == "CheckRun" and .conclusion == "CANCELLED")
      | {n: .name, id: ((.detailsUrl // "") | (try (capture("/runs/(?<id>[0-9]+)").id | tonumber) catch null))}]
    | map(. as $c | ($runs | map(select(.databaseId == $c.id)) | first) as $r
      | ($runs | map(select($r != null and .workflowName == $r.workflowName)) | max_by(.databaseId) | .databaseId) as $newest
      | "\($c.n) \($c.id // "?") \($newest // "?")") | .[]' <<<"$json")" || return 1
  [ -n "$verdict" ] || return 1
  # A check whose run can't be placed is not explained away.
  grep -q '?' <<<"$verdict" && return 1
  local stale latest
  stale="$(awk '$2 != $3 { printf "%s%s (run %s, superseded by run %s)", s, $1, $2, $3; s = ", " }' <<<"$verdict")"
  latest="$(awk '$2 == $3 { print $2 }' <<<"$verdict" | sort -u | tr '\n' ' ')"
  if [ -z "$latest" ]; then
    [ "$cancel_said" = "$stale" ] || { say "#$pr at ${head:0:8}: cancelled: $stale; waiting on the newer run"; cancel_said="$stale"; }
    return 0
  fi
  if jq -e 'any(.[]; .status != "completed")' <<<"$runs" >/dev/null; then
    [ "$cancel_said" = "busy $latest" ] || { say "#$pr at ${head:0:8}: run ${latest% } has cancelled jobs; waiting while a run for this head is still going"; cancel_said="busy $latest"; }
    return 0
  fi
  if [ ! -e "$marker" ]; then
    mkdir -p "$RERUNS" && : >"$marker"
    for id in $latest; do gh run rerun "${R[@]}" "$id" --failed >/dev/null 2>&1 && say "#$pr at ${head:0:8}: rerunning run $id's cancelled jobs (once for this head)"; done
    return 0
  fi
  # GitHub takes a moment to restart the jobs, so a rerun gets a few minutes before it counts as failed.
  [ $(( $(date +%s) - $(stat -c %Y "$marker") )) -lt 180 ] && return 0
  say "#$pr at ${head:0:8}: run ${latest% } was cancelled again after its one rerun"
  return 1
}

# True when json is a live read; otherwise asks for one on the next pass, for the caller to `continue`.
confirm() { [ "$src" = live ] && return 0; live=1; return 1; }

# The head this repository last pushed to the PR's branch (its origin/<branch> ref), when GitHub's
# head is an ancestor of it: GitHub's API trails a push by a few seconds, and judging that older head
# would report its old results.
pushed_ahead() { # <branch> <head>: prints the pushed sha and returns 0 while GitHub still shows an older head
  local p; p="$(git rev-parse -q --verify "refs/remotes/origin/$1" 2>/dev/null)" || return 1
  [ -n "$p" ] && [ "$p" != "$2" ] && git merge-base --is-ancestor "$2" "$p" 2>/dev/null && echo "$p"
}

# True when this worktree is a clean checkout of the PR's branch at its head and origin/main has commits
# the branch lacks (fetches main first).
can_update_behind() { # <branch> <head>
  [ "$(git branch --show-current 2>/dev/null)" = "$1" ] && [ "$(git rev-parse HEAD 2>/dev/null)" = "$2" ] && [ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] || return 1
  behind_main "$1" "$2"
}

# True when origin/main has commits the PR's head lacks. GitHub reports BEHIND only while main requires
# up-to-date branches, so this asks git. Fetches main at most once a minute; an unknown head is not behind.
main_fetched=0
behind_main() { # <branch> <head>
  local now; now=$(date +%s)
  if [ $(( now - main_fetched )) -ge 60 ]; then git fetch -q origin main 2>/dev/null && main_fetched=$now; fi
  git rev-parse -q --verify origin/main >/dev/null 2>&1 || return 1
  git cat-file -e "$2^{commit}" 2>/dev/null || git fetch -q origin "$1" 2>/dev/null
  git cat-file -e "$2^{commit}" 2>/dev/null || return 1
  ! git merge-base --is-ancestor origin/main "$2" 2>/dev/null
}

last="" seen_head="" head_since=0 warned=0 required="" rules_read=0 cr_head="" cr_state="" lag_said="" snap_head="" fix_tried=0
while :; do
  read_pr || { live=0; sleep "$poll"; continue; }
  live=0
  # A live head the snapshot hasn't caught up with refreshes it, for every other reader too.
  h="$(jq -r .headRefOid <<<"$json")"
  if [ "$src" = snapshot ]; then snap_head="$h"
  elif [ -n "$snap_head" ] && [ "$h" != "$snap_head" ]; then
    node "$(dirname "$0")/tools/pr-snapshot.mjs" --refresh >/dev/null 2>&1; snap_head="$h"
  fi
  if [ -z "$required" ]; then
    prot="$(gh api "$api/branches/$(jq -r .baseRefName <<<"$json")/protection" 2>/dev/null)" || prot=""
    required="$(jq -r '[.required_status_checks.contexts[]? | select(type == "string" and . != "review")] | join(" ")' <<<"$prot" 2>/dev/null)" || required=""
    # With the rules read, only the required checks (and review) can fail the wait; a failing check that
    # nothing requires is not this watcher's business.
    rules_read=0; jq -e '.required_status_checks.contexts | type == "array"' <<<"$prot" >/dev/null 2>&1 && rules_read=1
    [ -n "$required" ] || required="local-ci"
  fi
  state="$(jq -r .state <<<"$json")"
  head="$(jq -r .headRefOid <<<"$json")"
  branch="$(jq -r .headRefName <<<"$json")"
  merge_state="$(jq -r .mergeStateStatus <<<"$json")"
  mergeable="$(jq -r .mergeable <<<"$json")"
  [ "$state" = MERGED ] && { say "#$pr merged"; exit 0; }
  [ "$state" = CLOSED ] && { say "#$pr was closed without merging"; exit 6; }
  if pushed_ahead "$branch" "$head" >/dev/null; then
    confirm || continue
    # The ref is refetched, since a force push can leave it ahead of what the remote really holds.
    git fetch -q origin "$branch" 2>/dev/null
    if p="$(pushed_ahead "$branch" "$head")"; then
      [ "$lag_said" = "$p" ] || { say "#$pr: GitHub still shows ${head:0:8}; waiting for the pushed ${p:0:8}"; lag_said="$p"; }
      timed_out && { say "timed out waiting on #$pr"; exit 124; }
      sleep "$(( poll < 5 ? poll : 5 ))"; live=1; continue
    fi
  fi
  if [ "$head" != "$seen_head" ]; then seen_head="$head"; head_since=$(date +%s); warned=0; fi

  local_ci="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "StatusContext" and .context == "local-ci") | .state] | first // "NONE"' <<<"$json")"
  # A ci-rerun label means auto-CI will replace the head's local-ci result, so an old failure there
  # counts as still waiting. Auto-CI sets local-ci pending when it picks the rerun up.
  rerun="$(jq -r '[.labels[]?.name] | index("ci-rerun") != null' <<<"$json")"
  failing="$(jq -r --argjson rerun "$rerun" --argjson only "$rules_read" --arg req "$required review" '($req | split(" ")) as $r | [.statusCheckRollup[]? | if .__typename == "CheckRun" then {n: .name, s: (.conclusion // "")} else {n: .context, s: .state} end
    | select(($rerun and .n == "local-ci") | not)
    | select($only == 0 or (.n as $n | $r | index($n) != null))
    | select(.s == "FAILURE" or .s == "ERROR" or .s == "CANCELLED" or .s == "TIMED_OUT" or .s == "ACTION_REQUIRED") | "\(.n)=\(.s | ascii_downcase)"] | join(" ")' <<<"$json")"
  pending="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "CheckRun" and (.status != "COMPLETED")) | .name] | join(" ")' <<<"$json")"
  review="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "StatusContext" and .context == "review") | .state] | first // "NONE"' <<<"$json")"

  # Required statuses not yet passing, by name (a status or a check run). A skipped or neutral check
  # run satisfies a required check, as GitHub counts it.
  waiting="$(jq -r --arg req "$required" '($req | split(" ")) as $r | [.statusCheckRollup[]? | {n: (.context // .name), s: ((.state // .conclusion // "") | ascii_upcase)}] as $all
    | [$r[] | . as $name | select([$all[] | select(.n == $name and (.s == "SUCCESS" or .s == "SKIPPED" or .s == "NEUTRAL"))] | length == 0)] | join(" ")' <<<"$json")"

  # A changes-requested verdict ends the wait at once, names the verdict, and never merges main. A head that
  # only merges main into a PR whose last verdict was changes requested has no verdict of its own yet: that
  # verdict still stands until a fresh one.
  if [ "$review" = SUCCESS ]; then cr_state=""
  elif [ "$review" != FAILURE ] && [ "$review" != ERROR ] && [ "$cr_head" != "$head" ]; then
    cr_head="$head"; cr_state=""
    # Only a head that is itself a merge can be a main merge on top of a judged head: skip the review lookup otherwise.
    v=""; is_merge "$head" "$branch" && { v="$(last_verdict)" || v=""; }
    read -r vkind vsha _ <<<"$v"
    if [ "$vkind" = changes ] && [ -n "$vsha" ] && [ "$vsha" != "$head" ] && main_merges_only "$vsha" "$head" "$branch"; then cr_state="$v"; fi
  fi
  if [ "$review" = FAILURE ] || [ "$review" = ERROR ] || [ -n "$cr_state" ]; then
    confirm || continue
    if [ -n "$cr_state" ] && [ "$review" != FAILURE ] && [ "$review" != ERROR ]; then
      read -r _ vsha vlogin vurl <<<"$cr_state"
      say "#$pr at ${head:0:8}: changes were requested on ${vsha:0:8} by $vlogin and only main was merged since, so no fresh verdict yet: $vurl"
    else
      v="$(last_verdict)"; vlogin=""; vurl=""
      case "$v" in changes\ *|pass\ *) read -r _ _ vlogin vurl <<<"$v" ;; esac
      say "#$pr at ${head:0:8}: changes requested (review=failure)${vlogin:+ by $vlogin}${vurl:+: $vurl}"
    fi
    exit 2
  fi

  # A conflict with main is tried at once (it fails fast and names the PR for a person). A PR that is only
  # behind main is left alone, since main no longer requires an up-to-date branch, unless --update asks.
  behind=0; behind_main "$branch" "$head" && behind=1
  if [ "$mergeable" = CONFLICTING ] || { [ "$update" = always ] && [ "$behind" = 1 ]; }; then
    confirm || continue
    if [ "$update" = never ]; then say "#$pr is ${merge_state,,} (mergeable: ${mergeable,,})"; exit 3; fi
    update_branch "$branch" "$head"
    sleep "$poll"; continue
  fi
  behind_note=""; [ "$behind" = 1 ] && behind_note="behind main (merges as it is)"

  if [ -n "$failing" ]; then
    confirm || continue
    # Only cancellations: a superseded run is waited past, and the newest run is rerun once.
    if ! tr ' ' '\n' <<<"$failing" | grep -qv '=cancelled$' && handle_cancelled; then
      timed_out && { say "timed out waiting on #$pr"; exit 124; }
      sleep "$poll"; live=1; continue
    fi
    say "#$pr at ${head:0:8}: failing: $failing"
    link="$(local_ci_link)"; [ -n "$link" ] && say "Local CI: $link"
    # A failure a merge of main could fix: the branch lacks commits main has. Main goes in once, here.
    if [ "$update" != never ] && [ "$fix_tried" = 0 ] && can_update_behind "$branch" "$head"; then
      fix_tried=1
      say "#$pr is behind main; merging it in once, in case that fixes the failure"
      update_branch "$branch" "$head"
      sleep "$poll"; continue
    fi
    exit 2
  fi
  now="waiting on: ${waiting:-nothing}, review ${review,,}, running: ${pending:-none}$([ "$rerun" = true ] && echo ", local-ci rerun asked")${behind_note:+, $behind_note}"
  [ "$now" != "$last" ] && { say "#$pr at ${head:0:8}: $now"; last="$now"; }
  if [[ " $required " == *" local-ci "* ]] && [ "$local_ci" = NONE ] && [ "$warned" = 0 ] && [ $(( $(date +%s) - head_since )) -ge $(( pickup * 60 )) ]; then
    say "auto-CI hasn't reported on ${head:0:8} after ${pickup} min; check the timer"
    warned=1
  fi
  if [ -z "$waiting" ] && [ -z "$pending" ] && [ "$merged" = 0 ]; then
    confirm || continue
    say "#$pr at ${head:0:8}: $required and every GitHub check passed"
    exit 0
  fi
  timed_out && { say "timed out waiting on #$pr"; exit 124; }
  sleep "$poll"
done
