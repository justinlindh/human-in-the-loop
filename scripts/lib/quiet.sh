#!/usr/bin/env bash
# A quiet window on the machine for clean measurements (perf's bench): new local CI runs, main
# guard gates and software-lock renders wait while one is held. GPU work is not held back.
#   scripts/lib/quiet.sh run [--minutes N] -- <command> [args...]
#       Asks for the window, waits until running CI drains, the software render lock is free and
#       load1 is under QUIET_LOAD (default 10), then runs the command with the window held, for at
#       most N minutes (default 20, at most 30). Prints how long it waited. Logs kind=quiet with
#       wait_s, held_s and exit to the timing log. Exits with the command's status, or:
#         3  refused: two windows were already held in the last 24 hours
#         4  the machine didn't drain within QUIET_DRAIN_WAIT seconds (default 1800); says why
#   scripts/lib/quiet.sh status     prints the current window's holder, or "none"
# Sourced, it defines quiet_wait <who>: returns once no window is asked for or held (a window whose
# holder died counts as gone), saying once on stderr that it waits. The window's own command, and
# anything it starts, passes straight through (HITL_QUIET_HOLDER names the window's PID).
# Files live in HITL_LOCK_DIR (default ~/.cache/hitl-ci): quiet.request, quiet.history.

quiet_dir() { echo "${HITL_LOCK_DIR:-$HOME/.cache/hitl-ci}"; }

# The live window's holder PID, or nothing. A dead holder's request is left for the next window to
# overwrite: removing it here could race with a new window writing its own.
quiet_holder() {
  local req pid
  req="$(quiet_dir)/quiet.request"
  [ -f "$req" ] || return 0
  read -r pid _ <"$req" 2>/dev/null || return 0
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then echo "$pid"; fi
}

# Exit 0 when a window is held by someone other than the caller's own window.
quiet_blocks() {
  local h; h="$(quiet_holder)"
  [ -n "$h" ] && [ "${HITL_QUIET_HOLDER:-}" != "$h" ]
}

quiet_wait() {
  local who="${1:-a run}" holder said=0 t0=$SECONDS
  while quiet_blocks; do
    holder="$(quiet_holder)"
    [ $said = 1 ] || { echo "$who: waiting for the quiet window held by PID $holder (perf's measurements) to end" >&2; said=1; }
    sleep "${QUIET_POLL:-5}"
  done
  [ $said = 1 ] && echo "$who: the quiet window ended after $((SECONDS - t0))s" >&2
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -uo pipefail
  HERE="$(cd "$(dirname "$0")" && pwd)"
  source "$HERE/ci-capacity.sh"
  source "$HERE/timing.sh"
  DIR="$(quiet_dir)"; mkdir -p "$DIR"
  usage="usage: scripts/lib/quiet.sh run [--minutes N] -- <command> [args...] | status"
  case "${1:-}" in
    status) h="$(quiet_holder)"; if [ -n "$h" ]; then echo "quiet window held by PID $h"; else echo none; fi; exit 0 ;;
    run) shift ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
  minutes=20
  [ "${1:-}" = --minutes ] && { minutes="${2:?$usage}"; shift 2; }
  [ "${1:-}" = -- ] && shift
  [ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }
  [[ "$minutes" =~ ^[0-9]+$ ]] && [ "$minutes" -ge 1 ] || { echo "$usage" >&2; exit 2; }
  [ "$minutes" -le 30 ] || { echo "quiet: at most 30 minutes; asked for $minutes" >&2; exit 2; }

  # At most two windows a day.
  now=$(date +%s); hist="$DIR/quiet.history"; touch "$hist"
  recent=$(awk -v n="$now" '$1 > n - 86400' "$hist" | wc -l)
  if [ "$recent" -ge 2 ]; then
    echo "quiet: refused: $recent windows already held in the last 24 hours (at most 2); next one after $(date -d "@$(( $(awk -v n="$now" '$1 > n - 86400' "$hist" | sort -n | head -1 | cut -d' ' -f1) + 86400 ))" '+%H:%M')" >&2
    exit 3
  fi
  # One window at a time.
  exec 7>"$DIR/quiet.lock"
  flock -n 7 || { echo "quiet: refused: another window is held (PID $(quiet_holder))" >&2; exit 3; }

  req="$DIR/quiet.request"
  echo "$$ $now $minutes" >"$req"
  cmd=""
  # Only this window's own request is removed.
  trap '[ "$(cut -d" " -f1 "$req" 2>/dev/null)" = "$$" ] && rm -f "$req"' EXIT
  # A stop signal stops the command too and releases the window at once.
  trap '[ -n "$cmd" ] && kill -TERM "$cmd" 2>/dev/null && wait "$cmd" 2>/dev/null; echo "quiet: stopped; released" >&2; exit 143' TERM INT HUP
  # New work now waits; let what is running finish.
  soft="$DIR/render-checks.lock"; max="${QUIET_DRAIN_WAIT:-1800}"; t0=$SECONDS
  while :; do
    runs="$(ci_runs_going)"; load="$(cut -d' ' -f1 /proc/loadavg)"
    soft_free=1
    for soft in "$DIR"/render-checks.lock "$DIR"/render-checks-[0-9]*.lock; do
      [ -e "$soft" ] && ! flock -n "$soft" true 2>/dev/null && soft_free=0
    done
    if [ "$runs" -eq 0 ] && [ $soft_free = 1 ] && awk -v l="$load" -v m="${QUIET_LOAD:-10}" 'BEGIN { exit !(l < m) }'; then break; fi
    if [ $((SECONDS - t0)) -ge "$max" ]; then
      why="$runs CI run(s) going"; [ $soft_free = 1 ] || why+=", the software render lock held"; why+=", load1 $load"
      echo "quiet: the machine didn't drain in ${max}s ($why)" >&2
      timing_log kind=quiet wait_s="$((SECONDS - t0))" held_s=0 exit=4 drained=0
      exit 4
    fi
    sleep "${QUIET_POLL:-5}"
  done
  wait_s=$((SECONDS - t0))
  echo "quiet: waited ${wait_s}s for the machine to drain; holding the window for up to $minutes minutes" >&2
  echo "$now" >>"$hist"
  t1=$SECONDS
  # In the background, so a stop signal is handled at once rather than after the command ends.
  HITL_QUIET_HOLDER=$$ timeout "$((minutes * 60))" "$@" <&0 & cmd=$!
  wait "$cmd"; rc=$?; cmd=""
  held_s=$((SECONDS - t1))
  [ $rc -eq 124 ] && echo "quiet: the command ran past $minutes minutes and was stopped" >&2
  echo "quiet: held ${held_s}s; released" >&2
  timing_log kind=quiet wait_s="$wait_s" held_s="$held_s" exit="$rc"
  exit "$rc"
fi
