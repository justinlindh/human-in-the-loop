#!/usr/bin/env bash
# Cases for keeping a failed local CI step's log (ci-local's failtext block, ci-pr's prune). Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }

# The block that builds the failed-step text, lifted from ci-local.sh.
awk '/^failtext=""/ { f=1 } f { print } f && /^fi$/ { exit }' "$HERE/ci-local.sh" >"$tmp/block.sh"
grep -q 'CI_KEEP_DIR' "$tmp/block.sh" || { echo "FAIL could not lift the block from ci-local.sh"; exit 1; }
# The prune line, lifted from ci-pr.sh.
grep '^find "\$ROOT/failed"' "$HERE/ci-pr.sh" >"$tmp/prune.sh"
[ -s "$tmp/prune.sh" ] || { echo "FAIL could not lift the prune line from ci-pr.sh"; exit 1; }

LOGS="$tmp/logs"; mkdir -p "$LOGS"
seq 1 50 | sed 's/^/line /' >"$LOGS/bad.log"; echo fine >"$LOGS/good.log"; echo err >"$LOGS/mach:x.log"
NAMES=(good bad skipme mach:x); RESULTS=(pass FAIL "skipped: no sim changes" "error: machine (disk)")

CI_KEEP_DIR="$HOME/.cache/hitl-ci-test-$$/failed/pr1-abc1234"; KEEP="$CI_KEEP_DIR"; trap 'rm -rf "$tmp" "$HOME/.cache/hitl-ci-test-$$"' EXIT
source "$tmp/block.sh"
[ -f "$KEEP/bad.log" ] && [ "$(wc -l <"$KEEP/bad.log")" = 50 ] || fail "a failed step's full log is kept"
[ -f "$KEEP/mach:x.log" ] || fail "a machine failure's log is kept too"
[ ! -e "$KEEP/good.log" ] && [ ! -e "$KEEP/skipme.log" ] || fail "passing and skipped steps keep nothing"
[[ "$failtext" == *"line 50"* && "$failtext" == *"line 21"* && "$failtext" != *"line 20"$'\n'* ]] || fail "the comment carries the last 30 lines"
[[ "$failtext" == *'~/.cache/hitl-ci-test-'*'/failed/pr1-abc1234/bad.log'* ]] || fail "the comment says where the full log is, with ~ for home"
[[ "$failtext" != *"$HOME"* ]] || fail "no home path in the comment"

unset CI_KEEP_DIR; failtext=""; rm -rf "$KEEP"
source "$tmp/block.sh"
[ -z "$failtext" ] && [ ! -e "$KEEP" ] || fail "without CI_KEEP_DIR nothing is kept"

# Prune: directories older than CI_KEEP_DAYS go, newer stay.
ROOT="$HOME/.cache/hitl-ci-test-$$"; mkdir -p "$ROOT/failed/old" "$ROOT/failed/new"
touch -d '10 days ago' "$ROOT/failed/old"
source "$tmp/prune.sh"
[ ! -e "$ROOT/failed/old" ] && [ -d "$ROOT/failed/new" ] || fail "the prune removes old kept logs and leaves new ones"
ROOT="$tmp/nonexistent"; source "$tmp/prune.sh" || fail "pruning with no kept logs yet is harmless"

if [ $fails -eq 0 ]; then echo "ci-keep-logs: all cases pass"; else exit 1; fi
