#!/usr/bin/env bash
# Runs one heavy command (a balance or pair run, full tests, a capture, a render batch) through the
# machine's shared heavy-job queue: it waits for one of HITL_HEAVY_SLOTS slots (default 2, first come
# first served by the lock, not per lane), then for the 1-minute load to drop under HITL_HEAVY_LOAD
# (default: 0.75 per core), holding the slot, for at most HITL_HEAVY_QUIET seconds (default 180) before
# it runs anyway. The command runs niced (10) under `timeout` and its exit code is the script's.
# It prints how long it waited and ends with `heavy: exit <code> after <n>s`, so a background wrapper
# (scripts/tools/job.sh run <name> -- scripts/heavy.sh ...) wakes its owner once with the code.
# Usage: scripts/heavy.sh [--timeout <s>] [--wait-max <s>] -- <command...>
#   --timeout   seconds the command may run (default 3600; exit 124)
#   --wait-max  seconds to wait for a slot (default 7200; exit 75)
# Env: HITL_HEAVY_SLOTS, HITL_HEAVY_LOAD, HITL_HEAVY_QUIET, HITL_HEAVY_POLL (seconds between looks, 5),
#      HITL_HEAVY_DIR (default ~/.cache/hitl-ci/heavy).
set -uo pipefail
timeout_s=3600; wait_max=7200
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) timeout_s="${2:?}"; shift 2 ;;
    --wait-max) wait_max="${2:?}"; shift 2 ;;
    --) shift; break ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "usage: scripts/heavy.sh [--timeout <s>] [--wait-max <s>] -- <command...>" >&2; exit 2; }
dir="${HITL_HEAVY_DIR:-$HOME/.cache/hitl-ci/heavy}"; mkdir -p "$dir"
slots="${HITL_HEAVY_SLOTS:-2}"; poll="${HITL_HEAVY_POLL:-5}"; quiet_max="${HITL_HEAVY_QUIET:-180}"
cores="$(nproc 2>/dev/null || echo 4)"
ceiling="${HITL_HEAVY_LOAD:-$(( cores * 3 / 4 ))}"
load1() { cut -d' ' -f1 /proc/loadavg 2>/dev/null | cut -d. -f1; }

t0=$(date +%s); said=0; got=""
while :; do
  for i in $(seq 1 "$slots"); do
    exec 8>"$dir/slot-$i.lock"
    if flock -n 8; then got="$i"; break; fi
    exec 8>&-
  done
  [ -n "$got" ] && break
  [ $said = 1 ] || { echo "heavy: waiting for a heavy-job slot (all $slots taken)"; said=1; }
  [ $(( $(date +%s) - t0 )) -ge "$wait_max" ] && { echo "heavy: no slot after ${wait_max}s"; exit 75; }
  sleep "$poll"
done
waited=$(( $(date +%s) - t0 ))
[ "$waited" -ge 1 ] && echo "heavy: got slot $got after ${waited}s"
q0=$(date +%s)
while [ "$(load1)" -ge "$ceiling" ] && [ $(( $(date +%s) - q0 )) -lt "$quiet_max" ]; do sleep "$poll"; done
held=$(( $(date +%s) - q0 ))
[ "$held" -ge 1 ] && echo "heavy: waited ${held}s for the load to drop under $ceiling (now $(load1))"
r0=$(date +%s)
bash "$(dirname "$0")/nice10.sh" timeout "$timeout_s" "$@"; rc=$?
echo "heavy: exit $rc after $(( $(date +%s) - r0 ))s"
exit $rc
