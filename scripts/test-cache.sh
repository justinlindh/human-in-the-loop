#!/usr/bin/env bash
# Runs a test command, or skips it when the same command already passed on exactly this tree: the
# checkout's files as they are now (tracked, modified and untracked, minus ignored ones), the
# installed packages (node_modules/.package-lock.json) and the node version. A skip prints the
# earlier result and exits 0. Only passes are cached, and each for 12 hours.
# It never skips in CI: CI set (GitHub Actions), HITL_NO_TEST_CACHE=1 (local CI exports it), or a
# checkout with no git. package.json's test:fast runs through it.
# HITL_TEST_CACHE_DEBUG=1 prints the key's inputs and what happened (hit, run, fallback) to stderr.
# Usage: scripts/test-cache.sh <command...>
set -uo pipefail
[ $# -gt 0 ] || { echo "usage: scripts/test-cache.sh <command...>" >&2; exit 2; }
dbg() { [ "${HITL_TEST_CACHE_DEBUG:-}" = 1 ] && echo "test-cache-debug: $*" >&2; return 0; }
run() { dbg "uncached run: $why"; exec "$@"; }
why="CI or HITL_NO_TEST_CACHE"

if [ -n "${CI:-}" ] || [ "${HITL_NO_TEST_CACHE:-}" = 1 ]; then run "$@"; fi
why="not a git checkout"
common="$(git rev-parse --git-common-dir 2>/dev/null)" && gitdir="$(git rev-parse --git-dir 2>/dev/null)" || run "$@"
why="can't make $common/hitl-test-cache"
dir="$common/hitl-test-cache"; mkdir -p "$dir" 2>/dev/null || run "$@"
# The tree as it is now: a scratch copy of the index with every change and untracked file added. The
# copy keeps the index's mtime (cp -p): git re-hashes an entry whose mtime is not older than the
# index's, so a same-size edit made in the same timestamp tick as the index write is still seen.
idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
cp -p "$gitdir/index" "$idx" 2>/dev/null || : >"$idx"
why="git add or write-tree failed on the index copy"
tree="$(GIT_INDEX_FILE="$idx" git add -A . 2>/dev/null && GIT_INDEX_FILE="$idx" git write-tree 2>/dev/null)" || run "$@"
key="$(printf '%s\n' "$tree" "$(node --version 2>/dev/null)" "$(git hash-object node_modules/.package-lock.json 2>/dev/null)" "$*" | git hash-object --stdin)"
entry="$dir/$key"
dbg "key $key tree $tree node $(node --version 2>/dev/null) lock $(git hash-object node_modules/.package-lock.json 2>/dev/null) args $* entry $([ -f "$entry" ] && echo present || echo absent)"
if [ -f "$entry" ] && [ -n "$(find "$entry" -mmin -720 2>/dev/null)" ]; then
  echo "test-cache: skipped: this command passed on this exact tree (${tree:0:10}) at $(date -r "$entry" '+%H:%M'); HITL_NO_TEST_CACHE=1 runs it anyway"
  cat "$entry"
  dbg "hit"
  exit 0
fi
log="$(mktemp)"; trap 'rm -f "$idx" "$log"' EXIT
"$@" 2>&1 | tee "$log"; rc=${PIPESTATUS[0]}
if [ "$rc" -eq 0 ]; then
  grep -E '^ *(Test Files|Tests) ' "$log" | sed 's/^ */  /' >"$entry" 2>/dev/null || dbg "entry not written: $entry"
  dbg "ran, exit $rc, entry $([ -f "$entry" ] && echo written || echo missing)"
  ls -t "$dir" 2>/dev/null | tail -n +201 | sed "s|^|$dir/|" | xargs -r rm -f
fi
exit "$rc"
