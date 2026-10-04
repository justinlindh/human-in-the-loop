#!/usr/bin/env bash
# Runs a command at nice 10 or lower priority: a process already niced that far (or more) keeps its
# level, so wrapping twice never stacks. The test and CI scripts in package.json go through it so a
# lane's run doesn't starve the others on a shared machine.
# It also moves the command's temp directory (TMPDIR) to disk, unless the caller already set one:
# vitest keeps a module cache of tens of megabytes per run in a fresh temp directory that a killed
# run never removes, and /tmp here is RAM. Directories left over there are cleared once they are two
# hours old. HITL_TMPDIR picks another place.
# Usage: scripts/nice10.sh <command...>
[ $# -gt 0 ] || { echo "usage: scripts/nice10.sh <command...>" >&2; exit 2; }
if [ -z "${TMPDIR:-}" ] || [ "$TMPDIR" = /tmp ]; then
  disk="${HITL_TMPDIR:-$HOME/.cache/hitl-ci/tmp}"
  if mkdir -p "$disk" 2>/dev/null; then
    export TMPDIR="$disk"
    find "$disk" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[A-Za-z0-9_-]{21}' -mmin +120 -exec rm -rf {} + 2>/dev/null
  fi
fi
cur="$(nice 2>/dev/null || echo 0)"
[ "$cur" -ge 10 ] 2>/dev/null || exec nice -n $(( 10 - cur )) "$@"
exec "$@"
