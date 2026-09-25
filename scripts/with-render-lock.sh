#!/usr/bin/env bash
# Runs a command under the machine-wide render lock, the one local CI's render checks take, so heavy
# browser work (lifecycle, capture, stress or benchmark runs) never overlaps another render job.
# Inside a caller that already holds the lock it runs straight away (scripts/render-lock-held.sh);
# otherwise it waits for the lock, exports its PID as the holder, and execs the command.
# Usage: scripts/with-render-lock.sh <command> [args...]
#   RENDER_LOCK_WAIT  seconds to wait for the lock (default 1800); exit 75 if it runs out
set -uo pipefail
[ $# -gt 0 ] || { echo "usage: scripts/with-render-lock.sh <command> [args...]" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCK="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}/render-checks.lock"
if bash "$HERE/render-lock-held.sh" "$LOCK"; then exec "$@"; fi
mkdir -p "$(dirname "$LOCK")"
exec flock -w "${RENDER_LOCK_WAIT:-1800}" -E 75 "$LOCK" bash -c 'export HITL_RENDER_LOCK_HELD=$$; exec "$@"' bash "$@"
