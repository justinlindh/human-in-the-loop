#!/usr/bin/env bash
# Waits on a pull request after a push, from GitHub state only: it never starts local CI (the auto-CI
# timer does). When the PR falls behind main or conflicts, it merges origin/main into the PR's branch in
# this worktree (merge, never rebase), runs the tests, pushes, and waits on the new head. Only a ready PR
# (review and local-ci passed) that is first in line by ready time does that; the others wait their turn
# (see the update queue below), so a landing PR doesn't make every other PR rerun its checks for nothing.
#
# Usage: scripts/wait-for.sh <pr> [--merged] [--no-update] [--test "<cmd>"] [--poll <s>]
#                                  [--pickup <min>] [--timeout <min>]
#        scripts/wait-for.sh --issue <n> [--poll <s>] [--timeout <min>]
#   --repo       the PR's or issue's repository (owner/name), for the site repository; run it from a
#                checkout of that repository
#   --merged     keep waiting after the checks pass, until the PR merges
#   --no-update  report a PR that is behind or conflicting instead of merging main into it
#   --test       the test command gating the push (default: `nice -n 10 npm run test:push`, the tests
#                related to the branch's changes, where package.json has that script, else npm test;
#                the PR's required GitHub test check runs the whole suite on the pushed head)
#   --pickup     warn once when local-ci hasn't reported on the head after this many minutes (default 15)
#   --issue      wait until an issue closes (or, given a pull request number, until it merges or closes)
# Green means every status the base branch requires (branch protection, less review) passed and no
# GitHub check is still running; without access to the protection rules, local-ci stands in.
# Exit: 0 green (or merged, or the issue closed); 2 a check failed; 3 behind or conflicting with
# --no-update; 4 merging main conflicts; 5 the tests failed after merging main; 6 the PR was closed;
# 7 this worktree isn't on the PR's branch at its head, or is no longer on the branch the wait started on when a
#   merge or push is due; 124 timed out.
set -uo pipefail

pr="" issue="" repo="" merged=0 update=1 test_cmd="" poll=60 pickup=15 timeout=240
while [ $# -gt 0 ]; do
  case "$1" in
    --merged) merged=1 ;;
    --no-update) update=0 ;;
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

# The update queue. With main strict, every merge makes every other PR behind, and each one that merges
# main in reruns its checks for nothing when another PR lands first. So a PR merges main in only when it
# is ready (review passed and local-ci passed on its head) and first in line by when it became ready;
# the others wait. An entry is a file per PR in the queue directory, kept alive by the watcher's heartbeat
# (a timed-out watcher re-armed within the grace keeps its place). It is removed when the PR fails, gets
# changes requested, goes draft or awaiting-user, loses its auto-merge request, closes or merges, and when
# the watcher exits for any reason but a timeout, a signal or a green exit without --merged.
qdir="${HITL_MERGE_QUEUE:-$HOME/.cache/hitl-ci/merge-queue}"
[ -n "$repo" ] && qdir="$qdir/${repo//\//_}"
qgrace="${HITL_QUEUE_GRACE:-600}"
qfile="$qdir/${pr:-0}"
q_fresh() { [ $(( $(date +%s) - $(stat -c %Y "$1" 2>/dev/null || echo 0) )) -lt "$qgrace" ]; }
q_since() { sed -n 's/^ready_since=\([0-9][0-9]*\).*/\1/p' "$1" 2>/dev/null; }
q_get() { sed -n "s/^.*$2=\([a-z0-9]*\).*/\1/p" "$1" 2>/dev/null | head -n 1; } # <file> <key>
q_write() { # <ready_since> <state> <since>: replaces the entry whole, so a reader never sees it half written
  local t; mkdir -p "$qdir" && t="$(mktemp "$qdir/.tmp.XXXXXX")" \
    && printf 'ready_since=%s pr=%s state=%s since=%s\n' "$1" "$pr" "$2" "$3" >"$t" && mv -f "$t" "$qfile"
}
# q_state <ready|pending> [join]: records a change of state with its time; with `join`, also enters the
# queue when not in it. An entry that has been pending (its PR not fully green) longer than HITL_QUEUE_PENDING seconds (default 2700,
# a CI cycle and a half) no longer holds the line, and gets its place back when the PR is ready again.
q_state() {
  local now cur; now="$(date +%s)"
  if [ ! -f "$qfile" ]; then
    [ "${2:-}" = join ] && q_write "$now" "$1" "$now" && say "#$pr is in the update queue ($1)"
    return 0
  fi
  cur="$(q_get "$qfile" state)"
  [ "$cur" = "$1" ] || q_write "$(q_since "$qfile")" "$1" "$now"
}
q_leave() { rm -f "$qfile"; }
q_beat() { [ -f "$qfile" ] && touch "$qfile"; return 0; }
q_ahead() { # prints the PR number of a fresh entry ahead of this one; fails when this PR is first (or not queued)
  [ -f "$qfile" ] || return 1
  local mine f p t st sn; mine="$(q_since "$qfile")"; [ -n "$mine" ] || return 1
  for f in "$qdir"/*; do
    [ -f "$f" ] || continue; p="${f##*/}"
    case "$p" in ''|*[!0-9]*) continue ;; esac
    [ "$p" = "$pr" ] && continue
    q_fresh "$f" || continue
    st="$(q_get "$f" state)"; sn="$(q_get "$f" since)"
    [ "$st" = pending ] && [ -n "$sn" ] && [ $(( $(date +%s) - sn )) -ge "${HITL_QUEUE_PENDING:-2700}" ] && continue
    t="$(q_since "$f")"; [ -n "$t" ] || continue
    if [ "$t" -lt "$mine" ] || { [ "$t" -eq "$mine" ] && [ "$p" -lt "$pr" ]; }; then echo "$p"; return 0; fi
  done
  return 1
}

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
  git push -q
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

last="" seen_head="" head_since=0 warned=0 required="" lag_said="" snap_head=""
# Whatever ends the watcher (a conflict, failing tests, a moved worktree, a failed check) frees its place in
# the queue, except a timeout, a signal and a green exit without --merged, which keep it for a re-arm.
q_exit() { local rc=$?; if [ "$rc" != 124 ] && [ "$rc" -le 128 ] && { [ "$rc" != 0 ] || [ "$merged" = 1 ]; }; then q_leave; fi; }
[ "$update" = 1 ] && trap q_exit EXIT
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
    required="$(gh api "$api/branches/$(jq -r .baseRefName <<<"$json")/protection" 2>/dev/null \
      | jq -r '[.required_status_checks.contexts[]? | select(type == "string" and . != "review")] | join(" ")' 2>/dev/null)" || required=""
    [ -n "$required" ] || required="local-ci"
  fi
  state="$(jq -r .state <<<"$json")"
  head="$(jq -r .headRefOid <<<"$json")"
  branch="$(jq -r .headRefName <<<"$json")"
  merge_state="$(jq -r .mergeStateStatus <<<"$json")"
  mergeable="$(jq -r .mergeable <<<"$json")"
  [ "$state" = MERGED ] && { q_leave; say "#$pr merged"; exit 0; }
  [ "$state" = CLOSED ] && { q_leave; say "#$pr was closed without merging"; exit 6; }
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
  failing="$(jq -r --argjson rerun "$rerun" '[.statusCheckRollup[]? | if .__typename == "CheckRun" then {n: .name, s: (.conclusion // "")} else {n: .context, s: .state} end
    | select(($rerun and .n == "local-ci") | not)
    | select(.s == "FAILURE" or .s == "ERROR" or .s == "CANCELLED" or .s == "TIMED_OUT" or .s == "ACTION_REQUIRED") | "\(.n)=\(.s | ascii_downcase)"] | join(" ")' <<<"$json")"
  pending="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "CheckRun" and (.status != "COMPLETED")) | .name] | join(" ")' <<<"$json")"
  review="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "StatusContext" and .context == "review") | .state] | first // "NONE"' <<<"$json")"

  # The update queue (see q_join): ready means review and local-ci passed on this head with nothing failing.
  # A PR that is only pending after its own merge of main keeps its place.
  # Required statuses not yet passing, by name (a status or a check run). A skipped or neutral check
  # run satisfies a required check, as GitHub counts it.
  waiting="$(jq -r --arg req "$required" '($req | split(" ")) as $r | [.statusCheckRollup[]? | {n: (.context // .name), s: ((.state // .conclusion // "") | ascii_upcase)}] as $all
    | [$r[] | . as $name | select([$all[] | select(.n == $name and (.s == "SUCCESS" or .s == "SKIPPED" or .s == "NEUTRAL"))] | length == 0)] | join(" ")' <<<"$json")"

  # A PR held on purpose (draft, awaiting-user, auto-merge off) is never ready and leaves the queue. A PR
  # joins on review and local-ci passing (that fixes its place), but counts as ready only when every
  # required status and GitHub check is green; otherwise it is pending, and a PR pending too long stops
  # holding the line (see q_state).
  if [ "$update" = 1 ]; then
    on_hold="$(jq -r '(.isDraft == true) or ([.labels[]?.name] | index("awaiting-user") != null) or (has("autoMergeRequest") and .autoMergeRequest == null)' <<<"$json")"
    if [ "$on_hold" = true ]; then q_leave
    elif [ "$review" = SUCCESS ] && [ "$local_ci" = SUCCESS ] && [ -z "$failing" ]; then
      if [ -z "$waiting" ] && [ -z "$pending" ]; then q_state ready join; else q_state pending join; fi
    else q_state pending; fi
    case "$review" in FAILURE|ERROR) q_leave ;; esac
    if [ -n "$failing" ] && tr ' ' '\n' <<<"$failing" | grep -qv '=cancelled$'; then q_leave; fi
    q_beat
  fi

  # Behind main or conflicting. A conflict is tried at once (it fails fast and names the PR for a person);
  # a PR that is only behind merges main in when it is ready and first in line, else it waits (held).
  held=""
  if [ "$merge_state" = BEHIND ] || [ "$mergeable" = CONFLICTING ]; then
    confirm || continue
    if [ "$update" = 0 ]; then say "#$pr is ${merge_state,,} (mergeable: ${mergeable,,})"; exit 3; fi
    ahead=""
    if [ "$mergeable" != CONFLICTING ]; then
      if [ ! -f "$qfile" ]; then held="behind main, not ready yet; main goes in when it is ready and first in line"
      elif ahead="$(q_ahead)"; then held="behind main, queued behind #$ahead"
      fi
    fi
    if [ -z "$held" ]; then
      q_beat; update_branch "$branch" "$head"; q_beat
      sleep "$poll"; continue
    fi
  fi

  if [ -n "$failing" ]; then
    confirm || continue
    # Only cancellations: a superseded run is waited past, and the newest run is rerun once.
    if ! tr ' ' '\n' <<<"$failing" | grep -qv '=cancelled$' && handle_cancelled; then
      timed_out && { say "timed out waiting on #$pr"; exit 124; }
      sleep "$poll"; live=1; continue
    fi
    say "#$pr at ${head:0:8}: failing: $failing"
    link="$(local_ci_link)"; [ -n "$link" ] && say "Local CI: $link"
    q_leave
    exit 2
  fi
  now="waiting on: ${waiting:-nothing}, review ${review,,}, running: ${pending:-none}$([ "$rerun" = true ] && echo ", local-ci rerun asked")${held:+, $held}"
  [ "$now" != "$last" ] && { say "#$pr at ${head:0:8}: $now"; last="$now"; }
  if [[ " $required " == *" local-ci "* ]] && [ "$local_ci" = NONE ] && [ "$warned" = 0 ] && [ $(( $(date +%s) - head_since )) -ge $(( pickup * 60 )) ]; then
    say "auto-CI hasn't reported on ${head:0:8} after ${pickup} min; check the timer"
    warned=1
  fi
  if [ -z "$waiting" ] && [ -z "$pending" ] && [ -z "$held" ] && [ "$merged" = 0 ]; then
    confirm || continue
    say "#$pr at ${head:0:8}: $required and every GitHub check passed"
    exit 0
  fi
  timed_out && { say "timed out waiting on #$pr"; exit 124; }
  sleep "$poll"
done
