#!/usr/bin/env bash
# Cases for scripts/with-render-lock.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/with-render-lock.sh"
tmp="$(mktemp -d)"; bg=""
# The lock holder is flock with a child; stop the child first so nothing keeps the lock.
stop_holder() { [ -n "$bg" ] || return 0; pkill -P "$bg" 2>/dev/null; kill "$bg" 2>/dev/null; wait "$bg" 2>/dev/null; bg=""; }
trap 'stop_holder; rm -rf "$tmp"' EXIT
export CI_WORKTREE_ROOT="$tmp"; L="$tmp/render-checks.lock"
fails=0
expect() { [ "$2" = "$3" ] || { echo "FAIL $1: want $3, got $2"; fails=$((fails + 1)); }; }

out="$(bash "$W" bash -c 'flock -n "$0" true && echo free || echo held' "$L")"
expect 'holds the lock while the command runs' "$out" held
out="$(bash "$W" bash "$HERE/render-lock-held.sh" "$L" && echo nested-ok)"
expect 'the command sees itself as the holder' "$out" nested-ok
out="$(RENDER_LOCK_WAIT=2 bash "$W" bash "$W" echo inner)"
expect 'a nested call runs without waiting on itself' "$out" inner
bash "$W" sh -c 'exit 7'; expect 'passes the exit code through' "$?" 7

flock "$L" sleep 30 & bg=$!
sleep 0.3
RENDER_LOCK_WAIT=1 bash "$W" echo ran >/dev/null 2>&1; expect 'waits, then exits 75 when the lock is busy' "$?" 75
HITL_RENDER_LOCK_HELD=1 RENDER_LOCK_WAIT=1 bash "$W" echo ran >/dev/null 2>&1; expect 'a stray HITL_RENDER_LOCK_HELD does not skip the lock' "$?" 75
stop_holder

bash "$W" >/dev/null 2>&1; expect 'no command is a usage error' "$?" 2
bash "$W" --gpu >/dev/null 2>&1; expect 'a mode with no command is a usage error' "$?" 2

# GPU slots (three here, to keep the cases small).
export HITL_GPU_SLOTS=3
G1="$tmp/gpu-render-1.lock"; G2="$tmp/gpu-render-2.lock"; G3="$tmp/gpu-render-3.lock"
busy() { for f in "$@"; do flock -n "$f" true || { echo held; return; }; done; echo free; }
out="$(bash "$W" --gpu bash -c "$(declare -f busy); busy $G1 $G2 $G3")"
expect 'a GPU run holds a slot' "$out" held
out="$(bash "$W" --gpu bash -c "$(declare -f busy); busy $L")"
expect 'a GPU run leaves the software lock free' "$out" free
holders=()
for f in "$G1" "$G2"; do flock "$f" sleep 30 & holders+=($!); done
sleep 0.3
out="$(RENDER_LOCK_WAIT=2 bash "$W" --gpu echo ran)"; expect 'runs on the last free slot' "$out" ran
flock "$G3" sleep 30 & holders+=($!)
sleep 0.3
RENDER_LOCK_WAIT=1 bash "$W" --gpu echo ran >/dev/null 2>&1; expect 'waits, then exits 75 when every slot is busy' "$?" 75
out="$(RENDER_LOCK_WAIT=2 bash "$W" --software echo ran)"; expect 'busy GPU slots do not block the software lock' "$out" ran
for h in "${holders[@]}"; do pkill -P "$h" 2>/dev/null; kill "$h" 2>/dev/null; wait "$h" 2>/dev/null; done
out="$(HITL_GPU_SLOTS=1 RENDER_LOCK_WAIT=1 bash "$W" --gpu bash "$W" --gpu echo inner)"
expect 'a GPU run nested in a GPU run does not wait for a second slot' "$out" inner
out="$(HITL_GPU_SLOTS=1 RENDER_LOCK_WAIT=1 bash "$W" --software bash "$W" --gpu echo inner)"
expect 'a GPU run nested in a software run goes straight through' "$out" inner
out="$(bash "$W" --gpu bash "$W" --software bash -c "$(declare -f busy); busy $L")"
expect 'a software run nested in a GPU run still takes the software lock' "$out" held
[ $fails -eq 0 ] && echo "with-render-lock: all cases pass" || echo "with-render-lock: $fails failing"
[ $fails -eq 0 ]
