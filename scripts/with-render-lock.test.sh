#!/usr/bin/env bash
# Cases for scripts/with-render-lock.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/with-render-lock.sh"
tmp="$(mktemp -d)"; bg=""
# The lock holder is flock with a child; stop the child first so nothing keeps the lock.
stop_holder() { [ -n "$bg" ] || return 0; pkill -P "$bg" 2>/dev/null; kill "$bg" 2>/dev/null; wait "$bg" 2>/dev/null; bg=""; }
trap 'stop_holder; rm -rf "$tmp"' EXIT
export HITL_LOCK_DIR="$tmp"; L="$tmp/render-checks.lock"
export HITL_TIMINGS=off
export HITL_SOFT_SLOTS=1   # the pool cases below set their own
export HITL_GPU_FREE_MB=0  # the free-memory cases below turn it on
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
# Software pool (three slots; the load cap is lifted unless a case sets it).
export HITL_SOFT_SLOTS=3 HITL_SOFT_LOAD=100000
S1="$L"; S2="$tmp/render-checks-2.lock"; S3="$tmp/render-checks-3.lock"
out="$(bash "$W" --software bash -c "$(declare -f busy); busy $S1 $S2 $S3")"
expect 'a software run holds one slot' "$out" held
holders=()
flock "$S1" sleep 30 & holders+=($!)
sleep 0.3
out="$(RENDER_LOCK_WAIT=2 bash "$W" --software bash -c "$(declare -f busy); busy $S2")"
expect 'a busy first slot sends a software run to the next one' "$out" held
out="$(RENDER_LOCK_WAIT=2 bash "$W" --software bash -c "$(declare -f busy); busy $S1")"
expect 'the busy slot stays held by its owner' "$out" held
flock "$S2" sleep 30 & holders+=($!)
flock "$S3" sleep 30 & holders+=($!)
sleep 0.3
SOFT_POLL=1 RENDER_LOCK_WAIT=2 bash "$W" --software echo ran >/dev/null 2>&1; expect 'waits, then exits 75 when every software slot is busy' "$?" 75
out="$(RENDER_LOCK_WAIT=2 bash "$W" --gpu echo ran)"; expect 'busy software slots do not block a GPU run' "$out" ran
for h in "${holders[@]}"; do pkill -P "$h" 2>/dev/null; kill "$h" 2>/dev/null; wait "$h" 2>/dev/null; done
# A loaded machine uses only slot 1.
flock "$S1" sleep 30 & bg=$!
sleep 0.3
HITL_SOFT_LOAD=0 SOFT_POLL=1 RENDER_LOCK_WAIT=2 bash "$W" --software echo ran >/dev/null 2>&1; expect 'over the load cap only slot 1 is used' "$?" 75
stop_holder
out="$(bash "$W" --software bash "$W" --software echo inner)"; expect 'a software run nested in a software run does not take a second slot' "$out" inner
# Weighted GPU runs (three slots here).
nheld() { local n=0 f; for f in "$@"; do flock -n "$f" true || n=$((n + 1)); done; echo "$n"; }
out="$(bash "$W" --gpu --exclusive bash -c "$(declare -f nheld); nheld $G1 $G2 $G3" 2>/dev/null)"
expect '--exclusive holds every GPU slot' "$out" 3
out="$(bash "$W" --gpu --slots 2 bash -c "$(declare -f nheld); nheld $G1 $G2 $G3" 2>/dev/null)"
expect '--slots 2 holds two of three' "$out" 2
out="$(bash "$W" --gpu --slots 9 bash -c "$(declare -f nheld); nheld $G1 $G2 $G3" 2>/dev/null)"
expect 'a weight above the slot count takes them all' "$out" 3
out="$(bash "$W" --gpu --exclusive bash "$W" --gpu echo inner 2>/dev/null)"; expect 'a nested call under an exclusive holder runs' "$out" inner
bash "$W" --software --exclusive echo x >/dev/null 2>&1; expect '--exclusive needs --gpu' "$?" 2
bash "$W" --slots 2 echo x >/dev/null 2>&1; expect '--slots needs --gpu' "$?" 2
bash "$W" --gpu --slots 0 echo x >/dev/null 2>&1; expect '--slots needs a positive number' "$?" 2
bash "$W" --gpu --slots >/dev/null 2>&1; expect '--slots with no number is a usage error' "$?" 2
# It waits for a running small job to end.
flock "$G1" sleep 3 & bg=$!
sleep 0.3
s=$(date +%s); out="$(RENDER_LOCK_WAIT=15 bash "$W" --gpu --exclusive echo ran 2>/dev/null)"; w=$(( $(date +%s) - s ))
expect '--exclusive waits for a running job' "$out" ran
[ "$w" -ge 2 ] || { echo "FAIL --exclusive should have waited for the held slot (waited ${w}s)"; fails=$((fails + 1)); }
stop_holder
# A small run that arrives while a weighted run is collecting its slots queues behind it.
flock "$G1" sleep 4 & bg=$!
sleep 0.3
order="$tmp/order"; : >"$order"
( RENDER_LOCK_WAIT=20 bash "$W" --gpu --exclusive bash -c "echo exclusive >>'$order'; sleep 1" >/dev/null 2>&1 ) & ex=$!
sleep 1
( RENDER_LOCK_WAIT=20 bash "$W" --gpu bash -c "echo small >>'$order'" >/dev/null 2>&1 ) & sm=$!
wait "$ex" "$sm"
expect 'a small run waits behind a weighted one that is collecting slots' "$(tr '\n' ' ' <"$order")" "exclusive small "
stop_holder
# With every slot busy a weighted run gives up at RENDER_LOCK_WAIT.
flock "$G1" sleep 30 & bg=$!
sleep 0.3
RENDER_LOCK_WAIT=2 bash "$W" --gpu --exclusive echo ran >/dev/null 2>&1; expect '--exclusive exits 75 when a slot never frees' "$?" 75
stop_holder
# A GPU run waits for free GPU memory (a stand-in nvidia-smi reads the used MiB from a file).
mkdir -p "$tmp/bin"
printf '#!/usr/bin/env bash\necho "1000, $(cat "%s/used")"\n' "$tmp" >"$tmp/bin/nvidia-smi"; chmod +x "$tmp/bin/nvidia-smi"
echo 900 >"$tmp/used"
out="$(PATH="$tmp/bin:$PATH" HITL_GPU_FREE_MB=50 RENDER_LOCK_WAIT=3 bash "$W" --gpu echo ran 2>/dev/null)"
expect 'a GPU run starts when enough memory is free' "$out" ran
echo 990 >"$tmp/used"
PATH="$tmp/bin:$PATH" HITL_GPU_FREE_MB=50 VRAM_POLL=1 RENDER_LOCK_WAIT=2 bash "$W" --gpu echo ran >"$tmp/o" 2>&1; expect 'a GPU run exits 75 when the memory never frees up' "$?" 75
grep -q 'GPU memory still under 50 MiB free' "$tmp/o" || { echo "FAIL the wait should say what it waited for: $(cat "$tmp/o")"; fails=$((fails + 1)); }
( sleep 2; echo 900 >"$tmp/used" ) &
out="$(PATH="$tmp/bin:$PATH" HITL_GPU_FREE_MB=50 VRAM_POLL=1 RENDER_LOCK_WAIT=10 bash "$W" --gpu echo ran 2>/dev/null)"
expect 'a GPU run waits for the memory, then starts' "$out" ran
echo 990 >"$tmp/used"
out="$(PATH="$tmp/bin:$PATH" HITL_GPU_FREE_MB=0 RENDER_LOCK_WAIT=2 bash "$W" --gpu echo ran 2>/dev/null)"
expect 'a free-memory floor of 0 turns the check off' "$out" ran
out="$(PATH="$tmp/bin:$PATH" HITL_GPU_FREE_MB=50 RENDER_LOCK_WAIT=2 bash "$W" --software echo ran 2>/dev/null)"
expect 'a software run does not wait for GPU memory' "$out" ran
out="$(HITL_GPU_FREE_MB=50 PATH="/usr/bin:/bin" RENDER_LOCK_WAIT=2 bash "$W" --gpu echo ran 2>/dev/null)"
expect 'without nvidia-smi the check is skipped' "$out" ran
mkdir -p "$tmp/hang"; printf '#!/usr/bin/env bash\nsleep 60\n' >"$tmp/hang/nvidia-smi"; chmod +x "$tmp/hang/nvidia-smi"
s=$(date +%s); out="$(PATH="$tmp/hang:$PATH" HITL_GPU_FREE_MB=50 RENDER_LOCK_WAIT=30 bash "$W" --gpu echo ran 2>/dev/null)"
expect 'a hung nvidia-smi skips the check' "$out" ran
[ $(( $(date +%s) - s )) -lt 15 ] || { echo "FAIL a hung nvidia-smi should not hold the run past its timeout"; fails=$((fails + 1)); }
[ $fails -eq 0 ] && echo "with-render-lock: all cases pass" || echo "with-render-lock: $fails failing"
[ $fails -eq 0 ]
