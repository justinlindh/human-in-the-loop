#!/usr/bin/env bash
# Runs a command under one of the machine-wide render locks, so heavy browser work queues instead
# of piling onto the machine.
#   --software (the default)  one of HITL_SOFT_SLOTS software-GL slots (default: a quarter of the cores,
#                             at least 1). SwiftShader renders on the CPU, so each slot's jobs need
#                             cores of their own. Slot 1 is always available; another slot is taken
#                             only while load1 is under HITL_SOFT_LOAD (default: three quarters of the
#                             cores), so a loaded machine falls back to one holder at a time.
#                             Runs that need the whole machine (timing baselines) use a quiet window
#                             (scripts/lib/quiet.sh), which waits for every slot.
#   --gpu                     one of HITL_GPU_SLOTS (default 8) GPU slots: GPU renders cost a small
#                             fraction of the CPU and share the card well; the bound keeps many-browser
#                             jobs within its memory.
# Inside a caller that already holds a lock that covers the request it runs straight away
# (scripts/render-lock-held.sh): a software slot covers both kinds, a GPU slot covers GPU work.
# Otherwise it waits for a lock, exports its PID as the holder, and execs the command, which keeps
# the lock until it exits.
# It always says what it did on stderr: the lock it took and how long it waited, or that a holder
# already covers the run.
# Usage: scripts/with-render-lock.sh [--gpu|--software] <command> [args...]
#        scripts/with-render-lock.sh [--gpu|--software] --held   exit 0 if a caller's lock covers it
#   RENDER_LOCK_WAIT  seconds to wait for a lock (default 1800); exit 75 if it runs out
set -uo pipefail
usage="usage: scripts/with-render-lock.sh [--gpu|--software] <command> [args...] | [--gpu|--software] --held"
mode=software
case "${1:-}" in --gpu) mode=gpu; shift ;; --software) shift ;; esac
[ $# -gt 0 ] || { echo "$usage" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
# Lock files live in HITL_LOCK_DIR, one place for the whole machine whatever else a run relocates.
DIR="${HITL_LOCK_DIR:-$HOME/.cache/hitl-ci}"
SOFT="$DIR/render-checks.lock"   # software slot 1; slot k is render-checks-k.lock
cores="$(nproc 2>/dev/null || echo 4)"
SOFT_SLOTS="${HITL_SOFT_SLOTS:-$((cores / 4 > 0 ? cores / 4 : 1))}"
SOFT_LOAD="${HITL_SOFT_LOAD:-$((cores * 3 / 4))}"
soft_locks=("$SOFT"); for i in $(seq 2 "$SOFT_SLOTS"); do soft_locks+=("$DIR/render-checks-$i.lock"); done
SLOTS="${HITL_GPU_SLOTS:-8}"
gpu_locks=(); for i in $(seq 1 "$SLOTS"); do gpu_locks+=("$DIR/gpu-render-$i.lock"); done
WAIT="${RENDER_LOCK_WAIT:-1800}"
mkdir -p "$DIR"
# Each wait for a lock goes to the team's timing log, labelled with what it was for.
source "$HERE/lib/timing.sh"
label() {
  local a b
  # Word by word, so a job given as one bash -c string is labelled by its first real command.
  for a in $*; do
    a="${a//\'/}"; a="${a//\"/}"; [ -n "$a" ] || continue
    b="$(basename -- "$a")"
    case "$b" in node|npm|npx|bash|sh|run|timeout|nice|-*|[0-9]*) continue ;; esac
    echo "$b"; return
  done
  echo "${1:-?}"
}
waited() { awk -v a="$EPOCHREALTIME" -v b="$t0" 'BEGIN { printf "%.1f", a - b }'; }
log_wait() { timing_log kind=lock mode="$mode" for="$(label "${cmd[@]}")" wait_s="$(waited)" "$@"; }
cmd=()

covered() {
  if [ "$mode" = software ]; then bash "$HERE/render-lock-held.sh" "${soft_locks[@]}"
  else bash "$HERE/render-lock-held.sh" "${soft_locks[@]}" "${gpu_locks[@]}"; fi
}
if [ "$1" = --held ]; then covered; exit; fi
if covered; then
  echo "with-render-lock: $mode run covered by the lock held by PID $HITL_RENDER_LOCK_HELD" >&2
  exec "$@"
fi

cmd=("$@")
if [ "$mode" = software ]; then
  t0=$SECONDS; t0r=$EPOCHREALTIME
  # A quiet window (scripts/lib/quiet.sh) holds software renders back; its own run passes through.
  source "$HERE/lib/quiet.sh"
  slot=
  while :; do
    quiet_wait with-render-lock
    # Free slots first: slot 1 always, the others only while the machine has the cores for them.
    # With every slot taken, wait on slot 1 for a few seconds (so a waiter shows as blocked on the
    # lock) and look again.
    load="$(cut -d' ' -f1 /proc/loadavg)"
    for n in "${!soft_locks[@]}"; do
      [ "$n" -eq 0 ] || awk -v l="$load" -v m="$SOFT_LOAD" 'BEGIN { exit !(l < m) }' || break
      exec 8>"${soft_locks[$n]}"
      if flock -n 8; then slot=$((n + 1)); break; fi
      exec 8>&-
    done
    if [ -z "$slot" ]; then
      exec 8>"$SOFT"
      if flock -w "${SOFT_POLL:-5}" 8; then slot=1; else exec 8>&-; fi
    fi
    if [ -z "$slot" ]; then
      [ $((SECONDS - t0)) -lt "$WAIT" ] || { t0=$t0r; log_wait timed_out=1; echo "with-render-lock: no software render lock after ${WAIT}s" >&2; exit 75; }
      continue
    fi
    # A window asked for while this waited for the lock: give the lock back and wait for the window.
    quiet_blocks || break
    exec 8>&-; slot=
  done
  echo "with-render-lock: waited $((SECONDS - t0))s for the software render lock" >&2
  t0=$t0r; log_wait slot="$slot"
  export HITL_RENDER_LOCK_HELD=$$
  exec "$@"
fi

t0=$SECONDS; t0r=$EPOCHREALTIME
while :; do
  for lock in "${gpu_locks[@]}"; do
    exec 8>"$lock"
    if flock -n 8; then
      slot="${lock##*-}"; echo "with-render-lock: waited $((SECONDS - t0))s for GPU render slot ${slot%.lock}" >&2
      t0=$t0r; log_wait slot="${slot%.lock}"
      export HITL_RENDER_LOCK_HELD=$$
      exec "$@"
    fi
    exec 8>&-
  done
  [ $((SECONDS - t0)) -lt "$WAIT" ] || { t0=$t0r; log_wait timed_out=1; echo "with-render-lock: no GPU render slot after ${WAIT}s" >&2; exit 75; }
  sleep 1
done
