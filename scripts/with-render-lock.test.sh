#!/usr/bin/env bash
# Cases for scripts/with-render-lock.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/with-render-lock.sh"
tmp="$(mktemp -d)"; bg=""; trap '[ -n "$bg" ] && kill "$bg" 2>/dev/null; rm -rf "$tmp"' EXIT
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
kill "$bg"; pkill -P "$bg" 2>/dev/null; bg=""

bash "$W" >/dev/null 2>&1; expect 'no command is a usage error' "$?" 2
[ $fails -eq 0 ] && echo "with-render-lock: all cases pass" || echo "with-render-lock: $fails failing"
[ $fails -eq 0 ]
