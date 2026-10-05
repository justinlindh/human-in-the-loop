#!/usr/bin/env bash
# Cases for scripts/heavy.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
export HITL_HEAVY_DIR="$tmp/heavy" HITL_HEAVY_POLL=1 HITL_HEAVY_SLOTS=1 HITL_HEAVY_LOAD=100000
h() { bash "$HERE/heavy.sh" "$@"; }

out="$(h -- bash -c 'exit 3')"; rc=$?
[ $rc -eq 3 ] && grep -q 'heavy: exit 3 after' <<<"$out" || fail "the command's exit code passes through: $rc $out"
out="$(h --timeout 1 -- sleep 5)"; rc=$?
[ $rc -eq 124 ] || fail "a command past its limit exits 124: $rc"
h 2>/dev/null; [ $? -eq 2 ] || fail "no command exits 2"
[ "$(h -- bash -c 'nice' | grep -E '^-?[0-9]+$')" -ge 10 ] 2>/dev/null || fail "the command runs at nice 10 or more"

# One slot: a second job waits for the first, and a third gives up at --wait-max.
h -- sleep 4 >"$tmp/first" 2>&1 & first=$!
sleep 1
s=$(date +%s); out="$(h -- true)"; rc=$?; waited=$(( $(date +%s) - s ))
[ $rc -eq 0 ] && [ "$waited" -ge 2 ] && grep -q 'heavy: got slot 1 after' <<<"$out" || fail "a second job waits for the slot: rc $rc after ${waited}s: $out"
wait "$first"
h -- sleep 4 >/dev/null 2>&1 & first=$!
sleep 1
out="$(h --wait-max 1 -- true)"; rc=$?
[ $rc -eq 75 ] && grep -q 'no slot after 1s' <<<"$out" || fail "waiting past --wait-max exits 75: $rc $out"
wait "$first"

# Two slots run side by side.
export HITL_HEAVY_SLOTS=2
s=$(date +%s); h -- sleep 2 >/dev/null 2>&1 & a=$!; h -- sleep 2 >/dev/null 2>&1 & b=$!; wait "$a" "$b"
[ $(( $(date +%s) - s )) -le 3 ] || fail "two slots run two jobs at once"

# A load above the ceiling holds the slot for at most HITL_HEAVY_QUIET, then the command runs anyway.
s=$(date +%s); out="$(HITL_HEAVY_LOAD=0 HITL_HEAVY_QUIET=2 h -- true)"; rc=$?; held=$(( $(date +%s) - s ))
[ $rc -eq 0 ] && [ "$held" -ge 2 ] && grep -q 'for the load to drop' <<<"$out" || fail "a busy machine holds the job, then it runs: rc $rc after ${held}s: $out"

[ $fails -eq 0 ] && echo "heavy: all cases pass"
exit $fails
