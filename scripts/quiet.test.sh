#!/usr/bin/env bash
# Cases for scripts/lib/quiet.sh (the quiet window) and the waits that honour it, in a private lock
# directory. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
pids=()
cleanup() { for p in ${pids[@]+"${pids[@]}"}; do kill "$p" 2>/dev/null; done; rm -rf "$tmp"; }
trap cleanup EXIT
export HITL_LOCK_DIR="$tmp/locks" HITL_TIMINGS="$tmp/timings.jsonl" QUIET_POLL=0.2 QUIET_LOAD=100000 HITL_CI_SLOTS=2
mkdir -p "$HITL_LOCK_DIR"
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
Q="$HERE/lib/quiet.sh"

# A window runs its command with the holder marked, logs its timings and cleans up.
out="$(bash "$Q" run --minutes 1 -- bash -c 'echo "holder=$HITL_QUIET_HOLDER"' 2>&1)"; rc=$?
[ $rc -eq 0 ] || fail "a window should run its command (rc $rc: $out)"
grep -qE '^holder=[0-9]+$' <<<"$out" || fail "the command should see HITL_QUIET_HOLDER (got: $out)"
grep -q 'waited [0-9]*s for the machine to drain' <<<"$out" || fail "the window should say how long it waited (got: $out)"
grep -q '"kind":"quiet".*"wait_s":[0-9]*.*"held_s":[0-9]*' "$HITL_TIMINGS" || fail "the window should log kind=quiet with wait_s and held_s"
[ -e "$HITL_LOCK_DIR/quiet.request" ] && fail "the request should be gone after the window"
[ "$(bash "$Q" status)" = none ] || fail "status should say none after the window"

# The command's own exit status comes back.
bash "$Q" run -- false 2>/dev/null; rc=$?
[ $rc -eq 1 ] || fail "a failing command's status should come back (rc $rc)"

# A third window within 24 hours is refused with exit 3.
out="$(bash "$Q" run -- true 2>&1)"; rc=$?
[ $rc -eq 3 ] && grep -q 'refused' <<<"$out" || fail "a third window in a day should be refused with exit 3 (rc $rc: $out)"
: >"$HITL_LOCK_DIR/quiet.history"

# The window waits for running CI to drain, and gives up with exit 4 and the reason.
# flock -o keeps the lock in flock itself, so killing it frees the slot.
flock -o "$HITL_LOCK_DIR/ci-run-1.lock" sleep 30 & pids+=($!)
sleep 0.3
out="$(QUIET_DRAIN_WAIT=1 bash "$Q" run -- true 2>&1)"; rc=$?
[ $rc -eq 4 ] && grep -q '1 CI run(s) going' <<<"$out" || fail "an undrained machine should give exit 4 with the reason (rc $rc: $out)"
kill "${pids[-1]}" 2>/dev/null; wait "${pids[-1]}" 2>/dev/null
: >"$HITL_LOCK_DIR/quiet.history"

# While a window is held, a CI slot and a software render wait for it; the window's own run doesn't.
bash "$Q" run --minutes 1 -- bash -c "touch '$tmp/held'; sleep 2; source '$Q'; quiet_wait inner && touch '$tmp/inner-ok'" 2>/dev/null & pids+=($!)
for _ in $(seq 1 50); do [ -e "$tmp/held" ] && break; sleep 0.1; done
[ "$(bash "$Q" status)" != none ] || fail "status should name the holder while a window is held"
t0=$SECONDS
( source "$HERE/lib/ci-capacity.sh"; ci_slot_take 5 2>/dev/null && echo taken >"$tmp/slot" ) &
slot_pid=$!
sleep 0.5
[ -e "$tmp/slot" ] && fail "a CI slot should wait while the window is held"
wait "$slot_pid"
[ -e "$tmp/slot" ] || fail "the CI slot should be taken once the window ends"
[ -e "$tmp/inner-ok" ] || fail "the window's own command should pass quiet_wait"
[ $((SECONDS - t0)) -ge 1 ] || fail "the CI slot should have waited for the window"

# A window whose holder died no longer holds anything back.
echo "999999 $(date +%s) 20" >"$HITL_LOCK_DIR/quiet.request"
( source "$Q"; quiet_wait test ) & w=$!
sleep 0.5
if kill -0 "$w" 2>/dev/null; then fail "a dead holder's window should not hold anything back"; kill "$w"; fi
[ -e "$HITL_LOCK_DIR/quiet.request" ] && fail "a dead holder's request should be removed"

# with-render-lock --software waits for a window too.
: >"$HITL_LOCK_DIR/quiet.history"
bash "$Q" run --minutes 1 -- bash -c "touch '$tmp/held2'; sleep 1.5" 2>/dev/null & pids+=($!)
for _ in $(seq 1 50); do [ -e "$tmp/held2" ] && break; sleep 0.1; done
t0=$EPOCHREALTIME
RENDER_LOCK_WAIT=10 bash "$HERE/with-render-lock.sh" --software true 2>/dev/null
awk -v a="$EPOCHREALTIME" -v b="$t0" 'BEGIN { exit !(a - b >= 1) }' || fail "a software render should wait for the window"

[ $fails -eq 0 ] && echo "quiet: all cases pass" || echo "quiet: $fails failing"
[ $fails -eq 0 ]
