#!/usr/bin/env bash
# Runs a command under one of the machine-wide render locks, so heavy browser work queues instead
# of piling onto the machine.
#   --software (the default)  the software-GL lock: one holder at a time. SwiftShader renders on the
#                             CPU with every core, so two at once starve each other (and everyone).
#   --gpu                     one of HITL_GPU_SLOTS (default 8) GPU slots: GPU renders cost a small
#                             fraction of the CPU and share the card well; the bound keeps many-browser
#                             jobs within its memory.
# Inside a caller that already holds a lock that covers the request it runs straight away
# (scripts/render-lock-held.sh): the software lock covers both kinds, a GPU slot covers GPU work.
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
SOFT="$DIR/render-checks.lock"
SLOTS="${HITL_GPU_SLOTS:-8}"
gpu_locks=(); for i in $(seq 1 "$SLOTS"); do gpu_locks+=("$DIR/gpu-render-$i.lock"); done
WAIT="${RENDER_LOCK_WAIT:-1800}"
mkdir -p "$DIR"

covered() {
  if [ "$mode" = software ]; then bash "$HERE/render-lock-held.sh" "$SOFT"
  else bash "$HERE/render-lock-held.sh" "$SOFT" "${gpu_locks[@]}"; fi
}
if [ "$1" = --held ]; then covered; exit; fi
if covered; then
  echo "with-render-lock: $mode run covered by the lock held by PID $HITL_RENDER_LOCK_HELD" >&2
  exec "$@"
fi

if [ "$mode" = software ]; then
  t0=$SECONDS
  exec 8>"$SOFT"
  flock -w "$WAIT" 8 || { echo "with-render-lock: no software render lock after ${WAIT}s" >&2; exit 75; }
  echo "with-render-lock: waited $((SECONDS - t0))s for the software render lock" >&2
  export HITL_RENDER_LOCK_HELD=$$
  exec "$@"
fi

t0=$SECONDS
while :; do
  for lock in "${gpu_locks[@]}"; do
    exec 8>"$lock"
    if flock -n 8; then
      slot="${lock##*-}"; echo "with-render-lock: waited $((SECONDS - t0))s for GPU render slot ${slot%.lock}" >&2
      export HITL_RENDER_LOCK_HELD=$$
      exec "$@"
    fi
    exec 8>&-
  done
  [ $((SECONDS - t0)) -lt "$WAIT" ] || { echo "with-render-lock: no GPU render slot after ${WAIT}s" >&2; exit 75; }
  sleep 1
done
