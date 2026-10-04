#!/usr/bin/env bash
# Cases for scripts/nice10.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
base="$(nice)"
want=$(( base >= 10 ? base : 10 ))
[ "$(bash "$HERE/nice10.sh" nice)" -eq "$want" ] || fail "an unniced command should run at nice $want"
outer="$(nice -n 15 nice)"
[ "$outer" -ge 10 ] && [ "$(nice -n 15 bash "$HERE/nice10.sh" nice)" -eq "$outer" ] || fail "a process already niced to 10 or more should keep its level"
[ "$(bash "$HERE/nice10.sh" bash "$HERE/nice10.sh" nice)" -eq "$want" ] || fail "wrapping twice should not stack"
bash "$HERE/nice10.sh" true || fail "exit 0 should pass through"
bash "$HERE/nice10.sh" false && fail "a failing command should fail"
bash "$HERE/nice10.sh" 2>/dev/null; [ $? -eq 2 ] || fail "no command should exit 2"
[ $fails -eq 0 ] && echo "nice10: all cases pass" || echo "nice10: $fails failing"
[ $fails -eq 0 ]
