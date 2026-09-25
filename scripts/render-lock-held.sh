#!/usr/bin/env bash
# Exit 0 when an ancestor of the caller already holds a render lock, so a nested taker runs
# instead of waiting on itself. HITL_RENDER_LOCK_HELD names the holder's PID, and it counts only
# when that process is alive, is an ancestor of this one, and has one of the given lock files open.
# Any other value (unset, stale, a sibling, a plain 1) exits 1 and the caller takes the lock normally.
# Usage: scripts/render-lock-held.sh <lock-file> [<lock-file>...]
set -u
[ $# -gt 0 ] || { echo "usage: scripts/render-lock-held.sh <lock-file> [<lock-file>...]" >&2; exit 2; }
holder="${HITL_RENDER_LOCK_HELD:-}"
case "$holder" in ''|*[!0-9]*) exit 1 ;; esac
[ "$holder" -gt 1 ] && [ -d "/proc/$holder" ] || exit 1
targets=()
for lock in "$@"; do t="$(readlink -f -- "$lock")" && targets+=("$t"); done
open=1
for fd in /proc/"$holder"/fd/*; do
  f="$(readlink -f -- "$fd" 2>/dev/null)" || continue
  for t in "${targets[@]}"; do [ "$f" = "$t" ] && { open=0; break 2; }; done
done
[ $open -eq 0 ] || exit 1
p=$$
while [ -n "$p" ] && [ "$p" -gt 1 ]; do
  [ "$p" = "$holder" ] && exit 0
  p="$(sed -n 's/^PPid:[[:space:]]*//p' "/proc/$p/status" 2>/dev/null)"
done
exit 1
