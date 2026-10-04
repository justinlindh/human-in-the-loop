#!/usr/bin/env bash
# Keeps the RAM-backed /tmp from filling: removes agent session scratch directories
# (<tmp>/claude-<uid>/<project>/<session>) that nothing has touched for TMP_CLEAN_HOURS (default 24),
# leftover mktemp directories (<tmp>/tmp.*) older than that, then prunes git's records of worktrees
# whose directories are gone. Run hourly by hitl-tmp-clean.timer.
# Usage: scripts/tmp-clean.sh [--dry-run]
# Env: TMP_CLEAN_DIR (default /tmp), TMP_CLEAN_HOURS, TMP_CLEAN_REPO (the repo whose worktrees get pruned;
#      default this script's).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
dry=0; [ "${1:-}" = --dry-run ] && dry=1
TMP="${TMP_CLEAN_DIR:-/tmp}"
MIN=$(( ${TMP_CLEAN_HOURS:-24} * 60 ))
REPO="${TMP_CLEAN_REPO:-$(cd "$HERE/.." && pwd)}"
# Untouched: nothing in it, at any depth, changed within the window.
stale() { [ -z "$(find "$1" -mmin "-$MIN" -print -quit 2>/dev/null)" ]; }
gone=0
drop() { # <dir>
  if [ $dry = 1 ]; then echo "would remove $1"; else rm -rf -- "$1"; echo "removed $1"; fi
  gone=$((gone + 1))
}
for d in "$TMP"/claude-*/*/*/ ; do
  [ -d "$d" ] || continue
  d="${d%/}"; [ -O "$d" ] || continue
  stale "$d" && drop "$d"
done
for d in "$TMP"/tmp.*/ ; do
  [ -d "$d" ] || continue
  d="${d%/}"; [ -O "$d" ] || continue
  stale "$d" && drop "$d"
done
[ $dry = 1 ] || git -C "$REPO" worktree prune 2>/dev/null || true
echo "tmp-clean: $gone director$([ $gone = 1 ] && echo y || echo ies) $([ $dry = 1 ] && echo would go || echo removed)"
