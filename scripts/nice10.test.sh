#!/usr/bin/env bash
# Cases for scripts/nice10.sh. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
# The command must run at max(nice, 10), where nice is the level of the process that started it. That
# level is read just before and just after the run, and either one matches: a renice from outside (a
# load guard, a scheduler) in between cannot fail a case.
CHK='b=$(nice); r=$("$@"); a=$(nice)
for n in $b $a; do [ "$r" -eq $(( n >= 10 ? n : 10 )) ] && exit 0; done
echo "ran at $r (nice $b before, $a after)"; exit 1'
msg="$(bash -c "$CHK" _ bash "$HERE/nice10.sh" nice)" || fail "an unniced command should run at nice 10 or its own level: $msg"
msg="$(nice -n 15 bash -c "$CHK" _ bash "$HERE/nice10.sh" nice)" || fail "a process already niced to 10 or more should keep its level: $msg"
msg="$(bash -c "$CHK" _ bash "$HERE/nice10.sh" bash "$HERE/nice10.sh" nice)" || fail "wrapping twice should not stack: $msg"
bash "$HERE/nice10.sh" true || fail "exit 0 should pass through"
bash "$HERE/nice10.sh" false && fail "a failing command should fail"
bash "$HERE/nice10.sh" 2>/dev/null; [ $? -eq 2 ] || fail "no command should exit 2"
# keep_nice raises a process under the root that sits below 10 (a process manager that renices by name
# can put a job's shells there) and leaves its own sleep alone.
eval "$(sed -n '/^tree() {/,/^}/p; /^keep_nice() {/,/^}/p' "$HERE/nice10.sh")"
sleep 30 & victim=$!
HITL_NICE_KEEP=1 keep_nice $$ & keeper=$!
sleep 3
n="$(ps -o ni= -p "$victim" | tr -d ' ')"
kill "$keeper" "$victim" 2>/dev/null
[ "${n:-0}" -ge 10 ] 2>/dev/null || fail "keep_nice puts a process under the root at nice 10 or more: got [$n]"
# tree lists the pids under a root that sit below nice 10, and leaves out the ones under `skip`.
got="$(ps() { printf '%s\n' '100 1 0' '200 100 -4' '300 200 -4' '400 100 12' '500 1 -4'; }; tree 100 "" low | sort -n | tr '\n' ' ')"
[ "$got" = "100 200 300 " ] || fail "tree names the processes under the root below nice 10: [$got]"
got="$(ps() { printf '%s\n' '100 1 0' '200 100 -4' '300 200 -4'; }; tree 100 200 low | tr '\n' ' ')"
[ "$got" = "100 " ] || fail "tree leaves out what is under skip: [$got]"
# A keeper whose root is gone (here: not its parent) ends on its next pass.
( HITL_NICE_KEEP=1 keep_nice 1 ) & orphan=$!
sleep 3
kill -0 "$orphan" 2>/dev/null && { fail "a keeper that is not its root's child ends"; kill "$orphan" 2>/dev/null; }
# The command's exit code, its stdin and a TERM sent to the wrapper all reach the command.
bash "$HERE/nice10.sh" bash -c 'exit 7'; [ $? -eq 7 ] || fail "the command's exit code passes through"
[ "$(echo hi | bash "$HERE/nice10.sh" cat)" = hi ] || fail "stdin reaches the command"
bash "$HERE/nice10.sh" sleep 30 & w=$!
sleep 1; kill -TERM "$w"; wait "$w"; [ $? -ne 0 ] || fail "TERM to the wrapper stops the command"
# A wrapper killed outright leaves no keeper behind and no lock held; a SIGINT to the group stops the
# grandchildren too.
lk="$(mktemp -d)"
( exec 9>"$lk/lock"; flock 9; HITL_NICE_KEEP=1 exec bash "$HERE/nice10.sh" sleep 2 ) & w=$!
sleep 1; kill -KILL "$w"; sleep 4
flock -n "$lk/lock" true || fail "a killed wrapper's keeper must not keep the caller's lock"
rm -rf "$lk"
# (A background job starts with SIGINT ignored, which a script cannot trap, so perl resets it.)
perl -MPOSIX -e 'POSIX::setsid(); $SIG{INT} = "DEFAULT"; exec @ARGV' bash "$HERE/nice10.sh" bash -c "sleep 7; echo after" >/dev/null 2>&1 & g=$!
sleep 1; kill -INT -- "-$g" 2>/dev/null; sleep 1
sleep_left="$(ps -eo pgid=,args= | awk -v g="$g" '$1 == g && /sleep 7/' | wc -l)"
[ "$sleep_left" -eq 0 ] || { fail "SIGINT to the group stops the command's children"; kill -KILL -- "-$g" 2>/dev/null; }
[ "$(HITL_NICE_KEEP=0 bash "$HERE/nice10.sh" bash -c 'exit 4'; echo $?)" = 4 ] || fail "the keeper can be turned off"
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
