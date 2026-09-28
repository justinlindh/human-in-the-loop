#!/usr/bin/env bash
# Waits on a pull request after a push, from GitHub state only: it never starts local CI (the auto-CI
# timer does). When the PR falls behind main or conflicts, it merges origin/main into the PR's branch in
# this worktree (merge, never rebase), runs the tests, pushes, and waits on the new head.
#
# Usage: scripts/wait-for.sh <pr> [--merged] [--no-update] [--test "<cmd>"] [--poll <s>]
#                                  [--pickup <min>] [--timeout <min>]
#        scripts/wait-for.sh --issue <n> [--poll <s>] [--timeout <min>]
#   --merged     keep waiting after the checks pass, until the PR merges
#   --no-update  report a PR that is behind or conflicting instead of merging main into it
#   --test       the test command gating the push (default: npm test)
#   --pickup     warn once when local-ci hasn't reported on the head after this many minutes (default 15)
#   --issue      wait until an issue closes
# Exit: 0 green (or merged, or the issue closed); 2 a check failed; 3 behind or conflicting with
# --no-update; 4 merging main conflicts; 5 the tests failed after merging main; 6 the PR was closed;
# 7 this worktree isn't on the PR's branch at its head; 124 timed out.
set -uo pipefail

pr="" issue="" merged=0 update=1 test_cmd="npm test" poll=60 pickup=15 timeout=240
while [ $# -gt 0 ]; do
  case "$1" in
    --merged) merged=1 ;;
    --no-update) update=0 ;;
    --test) test_cmd="$2"; shift ;;
    --poll) poll="$2"; shift ;;
    --pickup) pickup="$2"; shift ;;
    --timeout) timeout="$2"; shift ;;
    --issue) issue="$2"; shift ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) pr="$1" ;;
  esac
  shift
done
[ -n "$pr" ] || [ -n "$issue" ] || { echo "usage: scripts/wait-for.sh <pr> | --issue <n>" >&2; exit 64; }

start=$(date +%s)
say() { echo "[wait-for $(date +%H:%M:%S)] $*"; }
timed_out() { [ $(( $(date +%s) - start )) -ge $(( timeout * 60 )) ]; }

if [ -n "$issue" ]; then
  while :; do
    state="$(gh issue view "$issue" --json state | jq -r .state)"
    [ "$state" = CLOSED ] && { say "issue #$issue closed"; exit 0; }
    timed_out && { say "timed out waiting for issue #$issue to close"; exit 124; }
    sleep "$poll"
  done
fi

local_ci_link() {
  gh api "repos/{owner}/{repo}/issues/$pr/comments?per_page=100" \
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
  git fetch -q origin main
  if ! git merge -q --no-edit origin/main; then
    git merge --abort
    say "merging origin/main into $branch conflicts; resolve it by hand"
    exit 4
  fi
  say "merged origin/main; running: $test_cmd"
  local log; log="$(mktemp)"
  if ! bash -c "$test_cmd" > "$log" 2>&1; then
    tail -20 "$log"
    say "tests failed after merging main; the merge is committed locally but not pushed"
    exit 5
  fi
  rm -f "$log"
  git push -q
  say "pushed $(git rev-parse --short HEAD)"
}

last="" seen_head="" head_since=0 warned=0
while :; do
  json="$(gh pr view "$pr" --json state,headRefOid,headRefName,mergeStateStatus,mergeable,statusCheckRollup)" || { sleep "$poll"; continue; }
  state="$(jq -r .state <<<"$json")"
  head="$(jq -r .headRefOid <<<"$json")"
  branch="$(jq -r .headRefName <<<"$json")"
  merge_state="$(jq -r .mergeStateStatus <<<"$json")"
  mergeable="$(jq -r .mergeable <<<"$json")"
  [ "$state" = MERGED ] && { say "#$pr merged"; exit 0; }
  [ "$state" = CLOSED ] && { say "#$pr was closed without merging"; exit 6; }
  if [ "$head" != "$seen_head" ]; then seen_head="$head"; head_since=$(date +%s); warned=0; fi

  if [ "$merge_state" = BEHIND ] || [ "$mergeable" = CONFLICTING ]; then
    if [ "$update" = 0 ]; then say "#$pr is ${merge_state,,} (mergeable: ${mergeable,,})"; exit 3; fi
    update_branch "$branch" "$head"
    sleep "$poll"; continue
  fi

  local_ci="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "StatusContext" and .context == "local-ci") | .state] | first // "NONE"' <<<"$json")"
  failing="$(jq -r '[.statusCheckRollup[]? | if .__typename == "CheckRun" then {n: .name, s: (.conclusion // "")} else {n: .context, s: .state} end
    | select(.s == "FAILURE" or .s == "ERROR" or .s == "CANCELLED" or .s == "TIMED_OUT" or .s == "ACTION_REQUIRED") | "\(.n)=\(.s | ascii_downcase)"] | join(" ")' <<<"$json")"
  pending="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "CheckRun" and (.status != "COMPLETED")) | .name] | join(" ")' <<<"$json")"
  review="$(jq -r '[.statusCheckRollup[]? | select(.__typename == "StatusContext" and .context == "review") | .state] | first // "NONE"' <<<"$json")"

  if [ -n "$failing" ]; then
    say "#$pr at ${head:0:8}: failing: $failing"
    link="$(local_ci_link)"; [ -n "$link" ] && say "Local CI: $link"
    exit 2
  fi
  now="local-ci ${local_ci,,}, review ${review,,}, running: ${pending:-none}"
  [ "$now" != "$last" ] && { say "#$pr at ${head:0:8}: $now"; last="$now"; }
  if [ "$local_ci" = NONE ] && [ "$warned" = 0 ] && [ $(( $(date +%s) - head_since )) -ge $(( pickup * 60 )) ]; then
    say "auto-CI hasn't reported on ${head:0:8} after ${pickup} min; check the timer"
    warned=1
  fi
  if [ "$local_ci" = SUCCESS ] && [ -z "$pending" ] && [ "$merged" = 0 ]; then
    say "#$pr at ${head:0:8}: local-ci and every GitHub check passed"
    exit 0
  fi
  timed_out && { say "timed out waiting on #$pr"; exit 124; }
  sleep "$poll"
done
