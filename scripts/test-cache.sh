#!/usr/bin/env bash
# Runs a test command, or skips it when the same command already passed on exactly this tree: the
# checkout's files as they are now (tracked, modified and untracked, minus ignored ones), the
# installed packages (node_modules/.package-lock.json) and the node version. A skip prints the
# earlier result and exits 0. Only passes are cached, and each for 12 hours.
# It never skips in CI: CI set (GitHub Actions), HITL_NO_TEST_CACHE=1 (local CI exports it), or a
# checkout with no git. Files no test reads (.claude, docs other than docs/effects, *.md) don't
# count as part of the tree. package.json's test:fast runs through it.
# Every cached call also appends a row to <git common dir>/hitl-test-cache.log.
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
# Paths no test reads (agent briefs, docs other than docs/effects, markdown) are left out of the
# tree, so editing them doesn't turn a passed run into a miss. HITL_TEST_CACHE_HASH_ALL=1 keeps them.
inert=(.claude docs ':(exclude)docs/effects' '*.md')
tree="$(GIT_INDEX_FILE="$idx" git add -A . 2>/dev/null \
  && { [ "${HITL_TEST_CACHE_HASH_ALL:-}" = 1 ] || GIT_INDEX_FILE="$idx" git rm -r -q --cached --ignore-unmatch -- "${inert[@]}" 2>/dev/null; } \
  && GIT_INDEX_FILE="$idx" git write-tree 2>/dev/null)" || run "$@"
key="$(printf '%s\n' "$tree" "$(node --version 2>/dev/null)" "$(git hash-object node_modules/.package-lock.json 2>/dev/null)" "$*" | git hash-object --stdin)"
entry="$dir/$key"
# One ledger row per cached call (scripts/tools/test-cache-report.sh reads it): time, worktree, result,
# seconds, tree, the worktree's previous tree, and the top-level dirs that differ from it.
ledger="$common/hitl-test-cache.log"; wt="$(basename "$(git rev-parse --show-toplevel)")"; started="$(date +%s)"
note() { # <result>
  local prev dirs
  prev="$(awk -F'\t' -v w="$wt" '$2 == w { t = $5 } END { print t }' "$ledger" 2>/dev/null)"
  [ -n "$prev" ] && [ "$prev" != "$tree" ] && dirs="$(git diff --name-only "$prev" "$tree" 2>/dev/null | awk -F/ '{ print (NF > 1 ? $1 "/" : $1) }' | sort -u | head -5 | paste -sd, -)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date +%s)" "$wt" "$1" "$(( $(date +%s) - started ))" "$tree" "${prev:--}" "${dirs:--}" >>"$ledger" 2>/dev/null || true
}
dbg "key $key tree $tree node $(node --version 2>/dev/null) lock $(git hash-object node_modules/.package-lock.json 2>/dev/null) args $* entry $([ -f "$entry" ] && echo present || echo absent)"
if [ -f "$entry" ] && [ -n "$(find "$entry" -mmin -720 2>/dev/null)" ]; then
  echo "test-cache: skipped: this command passed on this exact tree (${tree:0:10}) at $(date -r "$entry" '+%H:%M'); HITL_NO_TEST_CACHE=1 runs it anyway"
  cat "$entry"
  dbg "hit"; note hit
  exit 0
fi
log="$(mktemp)"; trap 'rm -f "$idx" "$log"' EXIT
"$@" 2>&1 | tee "$log"; rc=${PIPESTATUS[0]}
note "$([ "$rc" -eq 0 ] && echo pass || echo fail)"
if [ "$rc" -eq 0 ]; then
  grep -E '^ *(Test Files|Tests) ' "$log" | sed 's/^ */  /' >"$entry" 2>/dev/null || dbg "entry not written: $entry"
  dbg "ran, exit $rc, entry $([ -f "$entry" ] && echo written || echo missing)"
  ls -t "$dir" 2>/dev/null | tail -n +201 | sed "s|^|$dir/|" | xargs -r rm -f
fi
exit "$rc"
