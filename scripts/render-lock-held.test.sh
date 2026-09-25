#!/usr/bin/env bash
# Cases for scripts/render-lock-held.sh: only a live ancestor that has the lock file open counts as
# the holder. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HELD="$HERE/render-lock-held.sh"
tmp="$(mktemp -d)"; bg=()
trap 'for p in "${bg[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$tmp"' EXIT
L="$tmp/render.lock"; OTHER="$tmp/other.lock"
fails=0
expect() { # <want rc> <name> <command...>
  local want="$1" name="$2"; shift 2
  "$@"; local rc=$?
  [ $rc -eq "$want" ] || { echo "FAIL $name: want $want, got $rc"; fails=$((fails + 1)); }
}

expect 1 'unset' env -u HITL_RENDER_LOCK_HELD bash "$HELD" "$L"
expect 1 'plain 1' env HITL_RENDER_LOCK_HELD=1 bash "$HELD" "$L"
expect 1 'not a number' env HITL_RENDER_LOCK_HELD=yes bash "$HELD" "$L"

sleep 60 & dead=$!; kill "$dead"; wait "$dead" 2>/dev/null
expect 1 'stale exported PID' env HITL_RENDER_LOCK_HELD="$dead" bash "$HELD" "$L"

expect 1 'live ancestor without the lock' env HITL_RENDER_LOCK_HELD=$$ bash "$HELD" "$L"

flock "$L" sleep 60 & bg+=($!)
for _ in $(seq 50); do [ -n "$(pgrep -P "${bg[0]}")" ] && break; sleep 0.1; done
sib="$(pgrep -P "${bg[0]}")"
expect 1 'live holder that is not an ancestor' env HITL_RENDER_LOCK_HELD="$sib" bash "$HELD" "$L"
kill "${bg[0]}" "$sib" 2>/dev/null; wait 2>/dev/null

expect 0 'holder is the parent' flock "$L" bash -c 'export HITL_RENDER_LOCK_HELD=$$; bash "$0" "$1"' "$HELD" "$L"
expect 0 'holder is a grandparent' flock "$L" bash -c 'export HITL_RENDER_LOCK_HELD=$$; bash -c "bash \"\$0\" \"\$1\"" "$0" "$1"' "$HELD" "$L"
expect 1 'holder of a different lock' flock "$OTHER" bash -c 'export HITL_RENDER_LOCK_HELD=$$; bash "$0" "$1"' "$HELD" "$L"

[ $fails -eq 0 ] && echo "render-lock-held: all cases pass" || echo "render-lock-held: $fails failing"
[ $fails -eq 0 ]
