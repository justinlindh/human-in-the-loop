#!/usr/bin/env bash
# Named background jobs: start a long command, wait for it, read its log, all by name.
#
#   scripts/tools/job.sh start <name> [--timeout s] [--nice n] -- <cmd...>   run in the background
#   scripts/tools/job.sh run   <name> [--timeout s] [--nice n] -- <cmd...>   start, then wait (one call)
#   scripts/tools/job.sh wait  <name> [--timeout s] [--lines n]              block until it ends
#   scripts/tools/job.sh tail  <name> [-n lines] [-f]                        its log
#   scripts/tools/job.sh ls                                                  every job and its state
#   scripts/tools/job.sh stop  <name>                                        end it (its whole process group)
#
# A job runs under `nice` (default 10) and `timeout` (default 3600 s), in its own session, with its
# stdout and stderr in one log. Its exit code is recorded when it ends (124 when the timeout killed
# it). `wait` prints "job <name> exit <code>" and the end of the log, and exits with the job's code;
# with its own --timeout it exits 124 and leaves the job running. `run` under the Bash tool's
# run_in_background wakes the caller when the job ends, so nothing polls.
# State lives in ${HITL_JOBS_DIR:-~/.cache/hitl-jobs}/<name>/ (cmd, log, pid, exit, started).
set -u
root="${HITL_JOBS_DIR:-$HOME/.cache/hitl-jobs}"
die() { echo "job: $*" >&2; exit 2; }
usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

alive() { [ -f "$1/pid" ] && kill -0 "$(cat "$1/pid")" 2>/dev/null; }
state() { # <dir>: running | exit <code> | lost
  if [ -f "$1/exit" ]; then echo "exit $(cat "$1/exit")"; elif alive "$1"; then echo running; else echo lost; fi
}
descendants() { local c; for c in $(ps -o pid= --ppid "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
jobdir() { [ -n "${1:-}" ] || usage; case "$1" in */*|.*) die "bad job name: $1";; esac; echo "$root/$1"; }

start() {
  local name="${1:-}"; shift || true
  local dir; dir="$(jobdir "$name")"
  local tmo=3600 nc=10
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) tmo="${2:?--timeout needs seconds}"; shift 2 ;;
      --nice) nc="${2:?--nice needs a level}"; shift 2 ;;
      --) shift; break ;;
      *) die "start: expected -- before the command (got $1)" ;;
    esac
  done
  [ $# -gt 0 ] || die "start: no command"
  if [ -d "$dir" ] && alive "$dir" && [ ! -f "$dir/exit" ]; then die "job $name is already running (pid $(cat "$dir/pid")); stop it or pick another name"; fi
  rm -rf "$dir"; mkdir -p "$dir"
  printf '%q ' "$@" > "$dir/cmd"; echo >> "$dir/cmd"
  date +%s > "$dir/started"
  : > "$dir/log"
  # The wrapper records the exit code atomically once the command is done. setsid gives the job
  # its own process group, so `stop` reaches everything it spawned.
  setsid nohup bash -c '
    dir=$1; tmo=$2; nc=$3; shift 3
    timeout --kill-after=10 "$tmo" nice -n "$nc" "$@" >> "$dir/log" 2>&1 < /dev/null
    code=$?
    echo "$code" > "$dir/exit.tmp" && mv "$dir/exit.tmp" "$dir/exit"
  ' _ "$dir" "$tmo" "$nc" "$@" > /dev/null 2>&1 < /dev/null &
  echo $! > "$dir/pid"
  echo "job $name started (pid $!), log $dir/log"
}

wait_() {
  local name="${1:-}"; shift || true
  local dir; dir="$(jobdir "$name")"
  [ -d "$dir" ] || die "no job named $name"
  local wtmo="" lines=20
  while [ $# -gt 0 ]; do
    case "$1" in
      --timeout) wtmo="${2:?--timeout needs seconds}"; shift 2 ;;
      --lines) lines="${2:?--lines needs a count}"; shift 2 ;;
      *) die "wait: unknown option $1" ;;
    esac
  done
  local t0=$SECONDS
  while [ ! -f "$dir/exit" ]; do
    if ! alive "$dir" && [ ! -f "$dir/exit" ]; then sleep 1; [ -f "$dir/exit" ] || { echo "job $name: its process is gone without an exit code" >&2; tail -n "$lines" "$dir/log"; return 1; }; fi
    if [ -n "$wtmo" ] && [ $((SECONDS - t0)) -ge "$wtmo" ]; then echo "job $name: still running after ${wtmo} s" >&2; return 124; fi
    sleep 1
  done
  local code; code="$(cat "$dir/exit")"
  tail -n "$lines" "$dir/log"
  echo "job $name exit $code"
  return "$code"
}

tail_() {
  local name="${1:-}"; shift || true
  local dir; dir="$(jobdir "$name")"
  [ -d "$dir" ] || die "no job named $name"
  local n=40 follow=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -n) n="${2:?-n needs a count}"; shift 2 ;;
      -f) follow="-f"; shift ;;
      *) die "tail: unknown option $1" ;;
    esac
  done
  if [ -n "$follow" ] && alive "$dir"; then tail -n "$n" --pid="$(cat "$dir/pid")" -f "$dir/log"; else tail -n "$n" "$dir/log"; fi
}

ls_() {
  [ -d "$root" ] || { echo "no jobs"; return 0; }
  local d any=""
  for d in "$root"/*/; do
    [ -d "$d" ] || continue
    any=1
    d="${d%/}"
    local age=$(( $(date +%s) - $(cat "$d/started" 2>/dev/null || echo 0) ))
    printf '%-24s %-10s %6ss  %s\n' "$(basename "$d")" "$(state "$d")" "$age" "$(cut -c1-90 "$d/cmd" 2>/dev/null)"
  done
  [ -n "$any" ] || echo "no jobs"
}

stop_() {
  local name="${1:-}"
  local dir; dir="$(jobdir "$name")"
  [ -d "$dir" ] || die "no job named $name"
  if alive "$dir" && [ ! -f "$dir/exit" ]; then
    local pid; pid="$(cat "$dir/pid")"
    # `timeout` moves the command into a process group of its own, so the wrapper's group does not
    # cover it: walk the tree by parent pid instead. Children first, so nothing is orphaned.
    local tree; tree="$(descendants "$pid") $pid"
    # shellcheck disable=SC2086
    kill -TERM $tree 2>/dev/null
    # The wrapper dies on TERM without writing its exit code, so a dead wrapper also ends the wait.
    local i; for i in $(seq 1 50); do [ -f "$dir/exit" ] && break; alive "$dir" || break; sleep 0.2; done
    # shellcheck disable=SC2086
    kill -KILL $tree 2>/dev/null
    [ -f "$dir/exit" ] || echo 143 > "$dir/exit"
    echo "job $name stopped"
  else
    echo "job $name is not running ($(state "$dir"))"
  fi
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  start) start "$@" ;;
  run) name="${1:-}"; start "$@" && wait_ "$name" ;;
  wait) wait_ "$@" ;;
  tail) tail_ "$@" ;;
  ls) ls_ ;;
  stop) stop_ "$@" ;;
  *) usage ;;
esac
