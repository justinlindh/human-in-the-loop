#!/usr/bin/env bash
# Cases for scripts/nice10.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
# Each case reads the process's own nice right before it runs, so a renice from outside (a load guard,
# a scheduler) between cases cannot fail one.
expect() { local b; b="$(nice)"; echo $(( b >= 10 ? b : 10 )); }
got="$(bash "$HERE/nice10.sh" nice)"
[ "$got" -eq "$(expect)" ] || fail "an unniced command should run at nice $(expect) (got $got)"
outer="$(nice -n 15 nice)"
[ "$outer" -ge 10 ] && [ "$(nice -n 15 bash "$HERE/nice10.sh" nice)" -eq "$outer" ] || fail "a process already niced to 10 or more should keep its level"
once="$(bash "$HERE/nice10.sh" nice)"; twice="$(bash "$HERE/nice10.sh" bash "$HERE/nice10.sh" nice)"
[ "$twice" -eq "$once" ] || fail "wrapping twice should not stack (once $once, twice $twice)"
bash "$HERE/nice10.sh" true || fail "exit 0 should pass through"
bash "$HERE/nice10.sh" false && fail "a failing command should fail"
bash "$HERE/nice10.sh" 2>/dev/null; [ $? -eq 2 ] || fail "no command should exit 2"
disk="$(mktemp -d)"; trap 'rm -rf "$disk"' EXIT
[ "$(env -u TMPDIR HITL_TMPDIR="$disk/t" bash "$HERE/nice10.sh" bash -c 'echo $TMPDIR')" = "$disk/t" ] || fail "an unset TMPDIR should move to HITL_TMPDIR"
[ "$(TMPDIR=/tmp HITL_TMPDIR="$disk/t" bash "$HERE/nice10.sh" bash -c 'echo $TMPDIR')" = "$disk/t" ] || fail "TMPDIR=/tmp should move too"
[ "$(TMPDIR="$disk/mine" HITL_TMPDIR="$disk/t" bash "$HERE/nice10.sh" bash -c 'echo $TMPDIR')" = "$disk/mine" ] || fail "a TMPDIR the caller chose stays"
mkdir -p "$disk/t/AAAAAAAAAAAAAAAAAAAAA" "$disk/t/BBBBBBBBBBBBBBBBBBBBB" "$disk/t/keep"
touch -d '3 hours ago' "$disk/t/AAAAAAAAAAAAAAAAAAAAA" "$disk/t/keep"
env -u TMPDIR HITL_TMPDIR="$disk/t" bash "$HERE/nice10.sh" true
[ ! -e "$disk/t/AAAAAAAAAAAAAAAAAAAAA" ] || fail "an old 21-character directory should be cleared"
[ -e "$disk/t/BBBBBBBBBBBBBBBBBBBBB" ] && [ -e "$disk/t/keep" ] || fail "a recent one, and other names, should stay"
[ $fails -eq 0 ] && echo "nice10: all cases pass" || echo "nice10: $fails failing"
[ $fails -eq 0 ]
