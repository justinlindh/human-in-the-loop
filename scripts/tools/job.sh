#!/usr/bin/env bash
# Long jobs by name: start one in the background (niced, with a timeout, its PID, log and exit code
# recorded), wait on it, read its log. Replaces hand-written until-grep loops and PID hunting.
#   scripts/tools/job.sh start <name> [--timeout <s>] [--nice <n>] -- <command...>
#   scripts/tools/job.sh wait  <name> [--timeout <s>] [--tail <n>]   block until it ends, then print its exit code and log tail
#   scripts/tools/job.sh run   <name> [start options] -- <command...>   start then wait: one call for run_in_background
#   scripts/tools/job.sh tail  <name> [-n <lines>] [-f]
#   scripts/tools/job.sh ls
#   scripts/tools/job.sh stop  <name>                                 stop a running job (every process in its session)
#   scripts/tools/job.sh rm    <name>                                 forget a finished job
# start defaults: timeout 3600 s, nice 10. wait exits with the job's exit code (124 when the job hit
# its timeout), and 3 when wait itself timed out with the job still running. State lives in
# <git dir>/hitl-jobs (HITL_JOBS_DIR overrides it), so each worktree has its own job names.
set -uo pipefail
dir="${HITL_JOBS_DIR:-$(git rev-parse --git-dir 2>/dev/null || echo "${HITL_TMP:-$HOME/.cache/hitl-ci/tmp}")/hitl-jobs}"
die() { echo "job: $*" >&2; exit 2; }
usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
cmd="${1:-}"; [ -n "$cmd" ] || usage; shift
name=''; j=''
if [ "$cmd" != ls ]; then
  name="${1:-}"; [ -n "$name" ] || usage; shift
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || die "a job name is letters, digits, . _ -"
  j="$dir/$name"
fi

alive() { [ -s "$j/pid" ] && kill -0 "$(cat "$j/pid")" 2>/dev/null && [ ! -e "$j/exit" ]; }
need() { [ -d "$j" ] || die "no job named $name (job.sh ls)"; }

start() {
  local timeout=3600 nice=10
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    case "$1" in
      --timeout) timeout="${2:?--timeout needs seconds}"; shift 2 ;;
      --nice) nice="${2:?--nice needs a level}"; shift 2 ;;
      *) die "unknown option $1 (start options come before --)" ;;
    esac
  done
  [ "${1:-}" = -- ] || die "start needs -- <command...>"; shift
  [ $# -gt 0 ] || die "start needs a command after --"
  if [ -d "$j" ] && alive; then die "job $name is already running (pid $(cat "$j/pid")); job.sh stop $name first"; fi
  rm -rf "$j"; mkdir -p "$j" || die "can't create $j"
  printf '%s\n' "$*" >"$j/cmd"; date +%s >"$j/started"
  # A session of its own, so the job outlives this call and stop can signal its group. The exit code
  # is written last and atomically: its presence means the job ended.
  JOB_DIR="$j" setsid bash -c 'nice -n "$1" timeout "$2" "${@:3}"; echo $? >"$JOB_DIR/exit.tmp"; mv "$JOB_DIR/exit.tmp" "$JOB_DIR/exit"' _ "$nice" "$timeout" "$@" >"$j/log" 2>&1 </dev/null &
  echo $! >"$j/pid"
  echo "job $name: started, pid $(cat "$j/pid"), log $j/log"
}

wait_job() {
  local limit='' lines=20
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) limit="${2:?--timeout needs seconds}"; shift 2 ;;
      --tail) lines="${2:?--tail needs a line count}"; shift 2 ;;
      *) die "unknown wait option $1" ;;
    esac
  done
  need
  if alive; then
    # tail --pid returns when that process is gone, whatever started it.
    if [ -n "$limit" ]; then timeout "$limit" tail --pid="$(cat "$j/pid")" -f /dev/null; else tail --pid="$(cat "$j/pid")" -f /dev/null; fi
    if alive; then echo "job $name: still running after ${limit}s (pid $(cat "$j/pid")); job.sh wait $name again, or tail $name"; tail -n "$lines" "$j/log"; exit 3; fi
  fi
  # The wrapper writes the exit file just after the job ends: give it a moment.
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -e "$j/exit" ] && break; sleep 0.1; done
  local took=$(( $(date +%s) - $(cat "$j/started") ))
  if [ ! -e "$j/exit" ]; then echo "job $name: gone with no exit code (killed?) after ${took}s"; tail -n "$lines" "$j/log"; exit 1; fi
  local rc; rc="$(cat "$j/exit")"
  echo "job $name: exit $rc$([ "$rc" = 124 ] && echo ' (timed out)') after ${took}s; $j/log"
  tail -n "$lines" "$j/log"
  exit "$rc"
}

case "$cmd" in
  start) start "$@" ;;
  wait) wait_job "$@" ;;
  run) start "$@" && wait_job ;;
  tail)
    need; n=20; follow=()
    while [ $# -gt 0 ]; do case "$1" in -n) n="${2:?-n needs a count}"; shift 2 ;; -f) follow=(-f --pid="$(cat "$j/pid" 2>/dev/null || echo 0)"); shift ;; *) die "unknown tail option $1" ;; esac; done
    exec tail -n "$n" "${follow[@]}" "$j/log" ;;
  ls)
    [ -d "$dir" ] || { echo "no jobs"; exit 0; }
    printf '%-20s %-9s %-8s %-7s %s\n' NAME STATE PID AGE COMMAND
    for d in "$dir"/*/; do
      [ -d "$d" ] || continue
      j="${d%/}"; name="$(basename "$j")"
      if [ -e "$j/exit" ]; then st="exit $(cat "$j/exit")"; elif alive; then st=running; else st=lost; fi
      printf '%-20s %-9s %-8s %-7s %s\n' "$name" "$st" "$(cat "$j/pid" 2>/dev/null)" "$(( $(date +%s) - $(cat "$j/started" 2>/dev/null || date +%s) ))s" "$(cut -c1-80 "$j/cmd" 2>/dev/null)"
    done ;;
  stop)
    need; alive || { echo "job $name: not running"; exit 0; }
    pid="$(cat "$j/pid")"
    # The job's session id is its wrapper's pid (setsid). timeout puts the command in a group of its
    # own, so signal the whole session, which is exact, not a text match.
    pkill -TERM -s "$pid" 2>/dev/null
    for _ in $(seq 1 50); do pgrep -s "$pid" >/dev/null 2>&1 || break; sleep 0.1; done
    pgrep -s "$pid" >/dev/null 2>&1 && { pkill -KILL -s "$pid" 2>/dev/null; sleep 0.2; }
    [ -e "$j/exit" ] || echo 143 >"$j/exit"
    echo "job $name: stopped" ;;
  rm)
    need; alive && die "job $name is running; job.sh stop $name first"
    rm -rf "$j"; echo "job $name: removed" ;;
  *) usage ;;
esac
