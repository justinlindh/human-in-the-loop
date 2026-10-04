#!/usr/bin/env bash
# Cases for scripts/tmp-clean.sh in a scratch tmp directory. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
t="$tmp/t"; mkdir -p "$t/claude-1000/-proj/old/sub" "$t/claude-1000/-proj/new" "$t/claude-1000/-proj/touched/x" "$t/tmp.AAA" "$t/tmp.BBB" "$t/other"
touch "$t/claude-1000/-proj/old/sub/f" "$t/claude-1000/-proj/new/f" "$t/claude-1000/-proj/touched/x/f" "$t/tmp.AAA/f" "$t/tmp.BBB/f" "$t/other/f"
old='3 days ago'
touch -d "$old" "$t/claude-1000/-proj/old/sub/f" "$t/claude-1000/-proj/old/sub" "$t/claude-1000/-proj/old" "$t/tmp.AAA/f" "$t/tmp.AAA" "$t/other" "$t/other/f"
touch -d "$old" "$t/claude-1000/-proj/touched/x" "$t/claude-1000/-proj/touched"   # a fresh file inside keeps it
touch -d "$old" "$t/tmp.BBB"
run() { TMP_CLEAN_DIR="$t" TMP_CLEAN_REPO="$tmp" bash "$HERE/tmp-clean.sh" "$@" 2>&1; }
run --dry-run >/dev/null
[ -d "$t/claude-1000/-proj/old" ] || fail "a dry run removes nothing"
run >/dev/null
[ ! -e "$t/claude-1000/-proj/old" ] || fail "an untouched session directory goes"
[ -d "$t/claude-1000/-proj/new" ] || fail "a recent session directory stays"
[ -d "$t/claude-1000/-proj/touched" ] || fail "a session directory with a recent file inside stays"
[ ! -e "$t/tmp.AAA" ] || fail "an old mktemp directory goes"
[ -d "$t/tmp.BBB" ] || fail "a mktemp directory with a recent file stays"
[ -d "$t/other" ] || fail "other directories are never touched"
[ $fails -eq 0 ] && echo "tmp-clean: all cases pass" || echo "tmp-clean: $fails failing"
[ $fails -eq 0 ]
