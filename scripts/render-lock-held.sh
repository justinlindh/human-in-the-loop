#!/usr/bin/env bash
# Exit 0 when an ancestor of the caller already holds the render lock, so a nested taker runs
# instead of waiting on itself. HITL_RENDER_LOCK_HELD names the holder's PID, and it counts only
# when that process is alive, is an ancestor of this one, and has the lock file open. Any other
# value (unset, stale, a sibling, a plain 1) exits 1 and the caller takes the lock normally.
# Usage: scripts/render-lock-held.sh <lock-file>
set -u
lock="${1:?usage: scripts/render-lock-held.sh <lock-file>}"
holder="${HITL_RENDER_LOCK_HELD:-}"
case "$holder" in ''|*[!0-9]*) exit 1 ;; esac
[ "$holder" -gt 1 ] && [ -d "/proc/$holder" ] || exit 1
target="$(readlink -f -- "$lock")" || exit 1
open=1
for fd in /proc/"$holder"/fd/*; do
  [ "$(readlink -f -- "$fd" 2>/dev/null)" = "$target" ] && { open=0; break; }
done
[ $open -eq 0 ] || exit 1
p=$$
while [ -n "$p" ] && [ "$p" -gt 1 ]; do
  [ "$p" = "$holder" ] && exit 0
  p="$(sed -n 's/^PPid:[[:space:]]*//p' "/proc/$p/status" 2>/dev/null)"
done
exit 1
