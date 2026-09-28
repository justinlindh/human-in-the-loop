#!/usr/bin/env bash
# The one path to local CI: run by hitl-auto-ci.timer, it starts scripts/ci-pr.sh on every open,
# non-draft PR by a trusted author whose current head has no local-ci status yet, and keeps at most
# AUTO_CI_JOBS (default: HITL_CI_SLOTS, else 3) of its runs going. Each pass is quick: runs are
# detached, one process group each, recorded in $STATE/jobs/<pr> as "<pgid> <head>".
#   - A PR whose head moves on, that closes, or that turns draft has its run stopped (kill -TERM
#     -<pgid>; ci-pr then sets local-ci to error on the old head) and the new head queued.
#   - A head whose local-ci is error (the machine failed, not the code) is retried once. So is a head
#     left pending with no run of ours going for AUTO_CI_STUCK_MINUTES (default 75, past ci-pr's
#     60-minute limit): a run killed outright (SIGKILL, out of memory, a reboot) never posts its result.
#   - While the main guard has main red on a render step (its $GUARD/red file), a PR that changes
#     the render (src/render/, blender/ outside blender/checks/, public/models/) and no tooling
#     (scripts/, blender/checks/) waits: its render checks would fail on main's fault, not its own.
#   - The ci-rerun label asks for a fresh run of the current head: the label is removed and the run
#     starts whatever the head's status.
#   - PRs that passed review go first, then those without a verdict, then those with changes
#     requested, each by number. A docs-only PR (the light gate, scripts/ci-classify.sh) starts at
#     once, past the job cap: it takes no CI slot and finishes in seconds.
# ci-pr.sh refuses forks and untrusted authors itself; this only narrows the list first.
# Usage: scripts/auto-ci.sh [--once]  (the timer runs it with no arguments; --once is the same)
# Env: AUTO_CI_STATE (default ~/.cache/hitl-ci/auto), AUTO_CI_TREE (the checkout of main that runs
#      ci-pr; default this script's), AUTO_CI_GH and AUTO_CI_PR (stand-ins for tests).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STATE="${AUTO_CI_STATE:-$HOME/.cache/hitl-ci/auto}"
TREE="${AUTO_CI_TREE:-$(cd "$HERE/.." && pwd)}"
GH="${AUTO_CI_GH:-gh}"
CIPR="${AUTO_CI_PR:-$TREE/scripts/ci-pr.sh}"
MAX="${AUTO_CI_JOBS:-${HITL_CI_SLOTS:-3}}"
JOBS="$STATE/jobs"
mkdir -p "$JOBS" "$STATE/retried" "$STATE/pending"
STUCK="${AUTO_CI_STUCK_MINUTES:-75}"
GUARD_RED="${AUTO_CI_GUARD_RED:-$HOME/.cache/hitl-ci/main-guard/red}"
RENDER_STEPS=" stage render-checks golden golden-uncached pose-nodraw sweep "
red_render=""
if [ -f "$GUARD_RED" ]; then
  for step in $(cut -d' ' -f2- "$GUARD_RED" | tr ',' ' '); do
    case "$RENDER_STEPS" in *" $step "*) red_render+="${red_render:+, }$step" ;; esac
  done
fi
# True when the PR changes the render and no tooling.
render_only() {
  local files; files="$("$GH" pr view "$1" --json files --jq '.files[].path' 2>/dev/null)" || return 1
  grep -qE '^(scripts/|blender/checks/)' <<<"$files" && return 1
  grep -qE '^(src/render/|blender/|public/models/)' <<<"$files"
}
exec 9>"$STATE/lock"
flock -n 9 || exit 0
log() { printf '%s %s\n' "$(date -Is)" "$*" >>"$STATE/log"; }
alive() { kill -0 -- "-$1" 2>/dev/null; }

# Open PRs: number, draft, trusted, head, local-ci state on the head, rerun label, review state.
list="$("$GH" pr list --state open --limit 100 \
  --json number,isDraft,isCrossRepository,author,headRefOid,statusCheckRollup,labels \
  --jq '.[] | [.number, (.isDraft or .isCrossRepository or (.author.login != "justinlindh")),
        .headRefOid, ([.statusCheckRollup[]? | select(.context == "local-ci") | .state][0] // "none"),
        ([.labels[]?.name] | index("ci-rerun") != null),
        ([.statusCheckRollup[]? | select(.context == "review") | .state][0] // "none")] | @tsv')" || { log "pr list failed"; exit 1; }

declare -A head skip state rerun review
while IFS=$'\t' read -r n s h st r rv; do
  [ -n "$n" ] || continue
  head[$n]="$h"; skip[$n]="$s"; state[$n]="$st"; rerun[$n]="$r"; review[$n]="${rv:-none}"
done <<<"$list"
# True when the PR only changes paths on the light gate's list (docs): no CI slot, done in seconds.
is_light() {
  local files; files="$("$GH" pr view "$1" --json files --jq '.files[].path' 2>/dev/null)" && [ -n "$files" ] || return 1
  [ "$(bash "$HERE/ci-classify.sh" "$HERE/ci-skip-paths" <<<"$files" 2>/dev/null)" = light ]
}

stop() {
  local pr="$1" why="$2" pgid old
  read -r pgid old <"$JOBS/$pr"
  if alive "$pgid"; then kill -TERM -- "-$pgid" 2>/dev/null; log "stop #$pr ${old:0:7}: $why"; fi
  rm -f "$JOBS/$pr"
}

running=0
for f in "$JOBS"/*; do
  [ -e "$f" ] || continue
  pr="${f##*/}"; read -r pgid old <"$f"
  if ! alive "$pgid"; then rm -f "$f"; continue; fi
  if [ -z "${head[$pr]:-}" ]; then stop "$pr" "the PR closed"
  elif [ "${skip[$pr]}" = true ]; then stop "$pr" "the PR is a draft now"
  elif [ "${head[$pr]}" != "$old" ]; then stop "$pr" "head moved on to ${head[$pr]:0:7}"
  elif [ "${rerun[$pr]}" = true ]; then stop "$pr" "ci-rerun asked for a fresh run"
  else running=$((running + 1))
  fi
done

# This tree's install is what runs link to when the lockfiles match (ci-pr checks it with npm ls).
# Refresh it only while none of our runs is going, since a running one may be linked to it.
if [ "$running" -eq 0 ] && ! (cd "$TREE" && ${AUTO_CI_NPM:-npm} ls --depth=0 >/dev/null 2>&1); then
  if (cd "$TREE" && timeout 900 nice -n 10 ${AUTO_CI_NPM:-npm} ci --no-audit --no-fund >/dev/null 2>&1); then log "reinstalled node_modules from the lockfile"
  else log "npm ci failed in $TREE"; fi
fi

order() {
  local n p
  for n in "${!head[@]}"; do
    case "${review[$n]}" in SUCCESS) p=0 ;; FAILURE) p=2 ;; *) p=1 ;; esac
    echo "$p $n"
  done | sort -k1,1n -k2,2n | cut -d' ' -f2
}
for pr in $(order); do
  [ "${skip[$pr]}" = true ] && continue
  [ -e "$JOBS/$pr" ] && continue
  h="${head[$pr]}"; why=""
  if [ "${rerun[$pr]}" = true ]; then why="ci-rerun"
  elif [ "${state[$pr]}" = none ]; then why="new head"
  elif [ "${state[$pr]}" = ERROR ] && [ ! -e "$STATE/retried/$h" ]; then why="retry after a machine error"
  elif [ "${state[$pr]}" = PENDING ]; then
    # Pending with no run of ours: someone else's run, or one that died without a result.
    [ -e "$STATE/pending/$h" ] || : >"$STATE/pending/$h"
    if [ ! -e "$STATE/retried/$h" ] && [ -n "$(find "$STATE/pending/$h" -mmin "+$STUCK" 2>/dev/null)" ]; then
      why="retry: pending for over $STUCK minutes with no run going"
    fi
  fi
  [ -n "$why" ] || continue
  if [ -n "$red_render" ] && render_only "$pr"; then log "#$pr ${h:0:7} waits: main is red on $red_render"; continue; fi
  light=0
  if [ "$running" -ge "$MAX" ]; then
    if is_light "$pr"; then light=1; else log "#$pr ${h:0:7} waits: $running of $MAX runs going"; continue; fi
  fi
  case "$why" in
    ci-rerun) "$GH" pr edit "$pr" --remove-label ci-rerun >/dev/null 2>&1 || log "#$pr: could not remove ci-rerun" ;;
    retry*) : >"$STATE/retried/$h" ;;
  esac
  # setsid makes the run its own process group, so a stale run stops as a whole. The run must not
  # keep the pass lock (fd 9) open, or no later pass could start.
  (cd "$TREE" && exec setsid timeout 3600 nice -n 10 bash "$CIPR" "$pr" --head "$h" >"$STATE/pr-$pr.log" 2>&1 </dev/null 9>&-) &
  echo "$! $h" >"$JOBS/$pr"
  [ $light = 1 ] || running=$((running + 1))
  log "start #$pr ${h:0:7} ($why$([ $light = 1 ] && echo ", docs only"))"
done
find "$STATE/retried" "$STATE/pending" -type f -mtime +7 -delete 2>/dev/null
exit 0
