#!/usr/bin/env bash
# Cases for scripts/tools/job.sh in a scratch state directory. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'bash "$HERE/job.sh" ls >/dev/null 2>&1; for n in slow big; do bash "$HERE/job.sh" stop $n >/dev/null 2>&1; done; rm -rf "$tmp"' EXIT
export HITL_JOBS_DIR="$tmp/jobs"
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
J="$HERE/job.sh"

out="$(bash "$J" run ok -- bash -c 'echo hello; echo world')"; rc=$?
[ $rc -eq 0 ] && grep -q 'job ok: exit 0' <<<"$out" && grep -q '^world$' <<<"$out" || fail "run prints exit 0 and the log tail: $rc $out"
out="$(bash "$J" run bad -- bash -c 'echo boom; exit 7')"; rc=$?
[ $rc -eq 7 ] && grep -q 'exit 7' <<<"$out" && grep -q boom <<<"$out" || fail "a failing job's code comes through wait: $rc $out"
out="$(bash "$J" run tmo --timeout 1 -- sleep 30)"; rc=$?
[ $rc -eq 124 ] && grep -q 'timed out' <<<"$out" || fail "the job timeout gives 124: $rc $out"
out="$(bash "$J" start slow -- sleep 30)"; grep -q 'started, pid' <<<"$out" || fail "start reports the pid: $out"
out="$(bash "$J" start slow -- true 2>&1)"; rc=$?; [ $rc -eq 2 ] && grep -q 'already running' <<<"$out" || fail "a running name is refused: $rc $out"
out="$(bash "$J" ls)"; grep -Eq '^slow +running' <<<"$out" && grep -Eq '^ok +exit 0' <<<"$out" && grep -Eq '^bad +exit 7' <<<"$out" || fail "ls shows states: $out"
out="$(bash "$J" wait slow --timeout 1)"; rc=$?; [ $rc -eq 3 ] && grep -q 'still running' <<<"$out" || fail "wait --timeout on a running job exits 3: $rc $out"
out="$(bash "$J" stop slow)"; grep -q stopped <<<"$out" || fail "stop: $out"
out="$(bash "$J" wait slow)"; rc=$?; [ $rc -eq 143 ] || fail "a stopped job ends with 143: $rc $out"
pid="$(cat "$HITL_JOBS_DIR/slow/pid")"; ! kill -0 "$pid" 2>/dev/null || fail "stop kills the process"
bash "$J" start slow -- true >/dev/null; out="$(bash "$J" wait slow)"; rc=$?; [ $rc -eq 0 ] || fail "a name is reusable after it ended: $rc $out"
out="$(bash "$J" start big -- bash -c 'seq 1 100')"; bash "$J" wait big >/dev/null
out="$(bash "$J" tail big -n 3)"; [ "$out" = $'98\n99\n100' ] || fail "tail -n: $out"
out="$(bash "$J" wait big --tail 2)"; [ "$(wc -l <<<"$out")" -eq 3 ] || fail "wait --tail: $out"
out="$(bash "$J" wait nope 2>&1)"; rc=$?; [ $rc -eq 2 ] && grep -q 'no job named nope' <<<"$out" || fail "an unknown job: $rc $out"
out="$(bash "$J" rm ok)"; [ ! -d "$HITL_JOBS_DIR/ok" ] || fail "rm removes a finished job"
out="$(bash "$J" start 'bad name' -- true 2>&1)"; [ $? -eq 2 ] || fail "a bad name exits 2: $out"
out="$(bash "$J" start x --bogus -- true 2>&1)"; [ $? -eq 2 ] || fail "an unknown option exits 2: $out"
out="$(bash "$J" start x 2>&1)"; [ $? -eq 2 ] || fail "start without a command exits 2: $out"
# The job survives its caller: a start from a shell that exits still ends with a recorded code.
( bash "$J" start orphan -- bash -c 'sleep 1; echo done' >/dev/null ); out="$(bash "$J" wait orphan)"; [ $? -eq 0 ] && grep -q done <<<"$out" || fail "a job outlives its starter: $out"
out="$(cd "$tmp" && bash "$J" run cwd -- pwd)"; grep -q "$tmp" <<<"$out" || fail "the job runs in the caller's directory: $out"
[ $fails -eq 0 ] && echo "job: all cases pass"
exit $fails
