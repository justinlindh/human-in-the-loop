#!/usr/bin/env bash
# Cases for scripts/lib/ci-capacity.sh and ci-local's step retry for machine failures. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; holders=()
trap 'for p in "${holders[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
eq() { [ "$2" = "$3" ] || fail "$1: expected '$3', got '$2'"; }
export HITL_LOCK_DIR="$tmp/locks" HITL_CI_SLOTS=2 CI_SLOT_POLL=1
source "$HERE/lib/ci-capacity.sh"

# vitest_workers <cores> <load> <runs>
eq "an idle machine, one run" "$(vitest_workers 32 0 1)" 10
eq "a third of the cores at most" "$(vitest_workers 32 1.5 1)" 10
eq "the free cores shared by three runs" "$(vitest_workers 32 20 3)" 4
eq "an overloaded machine still gets 2" "$(vitest_workers 32 45 3)" 2
eq "a small machine gets 2" "$(vitest_workers 4 0 1)" 2

# Run slots: two held elsewhere, so a third run waits and gives up; one freed, it gets in.
mkdir -p "$HITL_LOCK_DIR"
for i in 1 2; do bash -c 'exec 5>"$1"; flock 5; exec sleep 60' _ "$HITL_LOCK_DIR/ci-run-$i.lock" & holders+=($!); done
sleep 0.3
eq "runs going with both slots held" "$(ci_runs_going)" 2
out="$( (CI_RUN_WAIT=2 ci_slot_take 6) 2>&1)"; rc=$?
eq "a run past the cap gives up with 75" "$rc" 75
[[ "$out" == *"waiting for a CI run slot"* ]] || fail "a waiting run should say so (got: $out)"
kill "${holders[1]}"; wait "${holders[1]}" 2>/dev/null
out="$( (CI_RUN_WAIT=10 ci_slot_take 6 && echo "slot=$CI_SLOT going=$(ci_runs_going)") 2>&1)"
[[ "$out" == *"slot=2 going=2"* ]] || fail "a freed slot should be taken and counted (got: $out)"
eq "the slot is released when its holder exits" "$(ci_runs_going)" 1

# infra_failure <log> <seconds>
printf 'page.goto: net::ERR_INSUFFICIENT_RESOURCES at http://localhost\n' >"$tmp/a.log"
eq "Chromium out of resources" "$(infra_failure "$tmp/a.log" 30)" ERR_INSUFFICIENT_RESOURCES
printf 'perf: asked for the GPU but got no WebGL2; set HITL_GL=software\n' >"$tmp/b.log"
eq "no GPU" "$(infra_failure "$tmp/b.log" 3)" "asked for the GPU but got no WebGL2"
printf 'error: unable to write file public/x.svg\n' >"$tmp/c.log"
eq "a full disk under git" "$(infra_failure "$tmp/c.log" 3)" "unable to write file"
: >"$tmp/d.log"
eq "silent and instant" "$(infra_failure "$tmp/d.log" 0)" "failed in 0s with no output"
infra_failure "$tmp/d.log" 12 >/dev/null && fail "a silent failure that ran a while is not the machine"
printf 'AssertionError: expected 3 to equal 4\n' >"$tmp/e.log"
infra_failure "$tmp/e.log" 0 >/dev/null && fail "an assertion is the code"
{ echo "stderr | a test printed ENOSPC while mocking the disk"; seq 1 60; echo "AssertionError: expected 3 to equal 4"; } >"$tmp/f.log"
infra_failure "$tmp/f.log" 30 >/dev/null && fail "a signature far above the end is test output, not why the step stopped"

# ci-local's step(): its own definition, with the summary and timing calls stubbed.
LOGS="$tmp/logs"; mkdir -p "$LOGS"; NAMES=(); RESULTS=()
record() { NAMES+=("$1"); RESULTS+=("$2"); }
timing_log() { :; }; timing_child_cpu() { echo 0; }; bal_running() { echo 0; }; load1() { echo 0; }
now() { date +%s; }; note() { echo "$*" >>"$LOGS/notes"; }
eval "$(sed -n '/^machine_why() {/,/^}/p; /^step() {/,/^}/p' "$HERE/ci-local.sh")"
export CI_INFRA_RETRY_WAIT=0
flaky() { local n; n=$(cat "$tmp/$1.n" 2>/dev/null || echo 0); echo $((n + 1)) >"$tmp/$1.n"; [ "$n" -ge 1 ] || { echo "ENOSPC: no space left on device, write"; return 1; }; }
always() { echo $(( $(cat "$tmp/$1.n" 2>/dev/null || echo 0) + 1 )) >"$tmp/$1.n"; echo "net::ERR_INSUFFICIENT_RESOURCES"; return 1; }
code() { echo $(( $(cat "$tmp/$1.n" 2>/dev/null || echo 0) + 1 )) >"$tmp/$1.n"; echo "AssertionError: expected 3 to equal 4"; return 1; }
silent() { echo $(( $(cat "$tmp/$1.n" 2>/dev/null || echo 0) + 1 )) >"$tmp/$1.n"; return 1; }
step s1 flaky s1 >/dev/null; step s2 always s2 >/dev/null; step s3 code s3 >/dev/null; step s4 silent s4 >/dev/null
eq "a machine failure that clears passes" "${RESULTS[0]}" pass
eq "  and was run twice" "$(cat "$tmp/s1.n")" 2
grep -q 's1 passed only on its retry after a machine failure' "$LOGS/notes" || fail "a pass on the retry should be noted"
eq "a machine failure twice is an error" "${RESULTS[1]}" "error: machine (ERR_INSUFFICIENT_RESOURCES)"
eq "  after two runs" "$(cat "$tmp/s2.n")" 2
eq "a code failure is FAIL" "${RESULTS[2]}" FAIL
eq "  and is not retried" "$(cat "$tmp/s3.n")" 1
eq "an instant silent failure twice is an error" "${RESULTS[3]}" "error: machine (failed in 0s with no output)"

[ $fails -eq 0 ] && echo "ci-capacity: all cases pass" || echo "ci-capacity: $fails failing"
[ $fails -eq 0 ]
