#!/usr/bin/env bash
# Runs locally everything the CI workflow runs, gated on exit codes, and prints a summary table.
# Usage: scripts/ci-local.sh [--base <ref>] [--title "<pr title>"] [--summary <file>]
#   --base     ref the commit check compares against (default origin/main)
#   --title    PR title for the commit check (skipped when empty)
#   --summary  also write the summary table (markdown) to this file
# The balance suite runs alongside the other steps; the rest run in order. Exit 0 when all pass, 1
# when a step fails on the code, 3 when the only failures are the machine's (see machine_why).
set -uo pipefail

BASE="origin/main"; TITLE=""; SUMMARY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    *) echo "ci-local: unknown option $1" >&2; exit 2 ;;
  esac
done

# Tools come from this script's own checkout; the tree under test is CI_DIR (default: that checkout).
SELF="$(cd "$(dirname "$0")" && pwd)"
# Every step's wall and CPU time go to the team's timing log (scripts/lib/timing.sh).
source "$SELF/lib/timing.sh"
cd "${CI_DIR:-$SELF/..}"
# CI_LOGS keeps the step logs in that directory instead of a temporary one removed at the end.
LOGS="${CI_LOGS:-$(mktemp -d)}"; mkdir -p "$LOGS"
declare -a NAMES RESULTS TIMES
now() { date +%s; }
# Notes for the summary, kept in a file so steps running in the background can add them.
note() { echo "$*" >>"$LOGS/notes"; }
load1() { cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0; }

# At most HITL_CI_SLOTS runs at once on the machine (scripts/lib/ci-capacity.sh); a run past the cap
# waits here, before it installs anything. The slot is held on fd 6 until the run exits. A run that
# gets no slot is a machine failure (exit 3), not a code one.
source "$SELF/lib/ci-capacity.sh"
slot_t0=$EPOCHREALTIME
ci_slot_take 6; slot_rc=$?
timing_log kind=lock mode=ci-run for=ci-local wait_s="$(awk -v a="$EPOCHREALTIME" -v b="$slot_t0" 'BEGIN { printf "%.1f", a - b }')" ${CI_SLOT:+slot=$CI_SLOT} $([ $slot_rc = 0 ] || echo timed_out=1)
if [ $slot_rc -ne 0 ]; then
  echo "ci-local: gave up waiting for a CI run slot; the machine is full, re-run later"
  [ -n "$SUMMARY" ] && printf '| step | result | seconds |\n|---|---|---|\n| ci-run-slot | error: machine (no CI run slot after %ss) | 0 |\n' "${CI_RUN_WAIT:-7200}" >"$SUMMARY"
  exit 3
fi
[ "${CI_SLOT_WAITED:-0}" -gt 0 ] && note "waited ${CI_SLOT_WAITED}s for a CI run slot (at most $(ci_slot_count) runs at once)"
run_load0="$(load1)"; run_going0="$(ci_runs_going)"

record() { NAMES+=("$1"); RESULTS+=("$2"); TIMES+=("$3"); }

bal_pid=""
bal_running() { [ -n "$bal_pid" ] && kill -0 "$bal_pid" 2>/dev/null && echo 1 || echo 0; }
# A failed step whose output says the machine ran out of something (infra_failure) runs once more
# after a pause. Failing that way again records "error: machine (...)", which makes the run exit 3
# instead of 1. Render steps retry inside render_step, so here they are only classified, from their
# last pass (<name>.retry.log when there was one). Exit 75, a lock wait that ran out, is the machine.
machine_why() { # <rc> <log> <seconds>: prints the reason when the failure is the machine's
  [ "$1" -eq 75 ] && { echo "timed out waiting for a lock"; return 0; }
  infra_failure "$2" "$3"
}
step() {
  local name="$1"; shift
  local t0 c0 b0 rc=0; t0=$(now); c0=$(timing_child_cpu); b0=$(bal_running)
  local log="$LOGS/$name.log" why=""
  rm -f "$LOGS/$name.retry.log"
  "$@" >"$log" 2>&1 || rc=$?
  local last=$(( $(now) - t0 ))
  if [ $rc -ne 0 ] && [ "$1" != render_step ] && why="$(machine_why "$rc" "$log" "$last")"; then
    echo "$name: failed on the machine ($why); retrying once"
    timing_log kind=infra tool=ci-local step="$name" why="$why" load1="$(load1)" exit=$rc
    sleep "${CI_INFRA_RETRY_WAIT:-20}"
    local t1; t1=$(now); rc=0
    "$@" >"$LOGS/$name.retry.log" 2>&1 || rc=$?
    last=$(( $(now) - t1 ))
    { echo "---- retry after a machine failure ($why)"; cat "$LOGS/$name.retry.log"; } >>"$log"
    [ $rc -eq 0 ] && note "$name passed only on its retry after a machine failure ($why)"
  fi
  local wall=$(( $(now) - t0 ))
  if [ $rc -eq 0 ]; then record "$name" pass "$wall"
  else
    local lastlog="$log"; [ -f "$LOGS/$name.retry.log" ] && lastlog="$LOGS/$name.retry.log"
    if why="$(machine_why "$rc" "$lastlog" "$last")"; then record "$name" "error: machine ($why)" "$wall"
    else record "$name" FAIL "$wall"; fi
    echo "---- $name failed; last lines:"; tail -n 25 "$log"
  fi
  # CPU counts only when the background balance run did not finish (and add its own) meanwhile.
  local cpu=""
  [ "$b0" = "$(bal_running)" ] && cpu="cpu_s=$(awk -v a="$(timing_child_cpu)" -v b="$c0" 'BEGIN { printf "%.2f", a - b }')"
  timing_log kind=step tool=ci-local step="$name" wall_s="$wall" $cpu exit=$rc
}

# pstep <name> <command...> starts a step in the background (golden, alongside the GPU steps): its output goes to $LOGS/<name>.log and
# its result to $LOGS/<name>.result, with its own vite cache (a dev server re-optimizing a dependency
# must not reload another step's page) and its own CPU in the timing log. pjoin waits for the
# background steps and records them.
declare -a PNAMES PPIDS
pstep() {
  local name="$1"; shift
  (
    me=$BASHPID; c0=$(timing_child_cpu "$me"); t0=$(now); rc=0
    rm -f "$LOGS/$name.retry.log"
    HITL_VITE_CACHE=".vite/parallel-$name" "$@" >"$LOGS/$name.log" 2>&1 || rc=$?
    wall=$(( $(now) - t0 ))
    echo "$rc $wall" >"$LOGS/$name.result"
    timing_log kind=step tool=ci-local step="$name" wall_s="$wall" cpu_s="$(awk -v a="$(timing_child_cpu "$me")" -v b="$c0" 'BEGIN { printf "%.2f", a - b }')" exit=$rc parallel=1
  ) &
  PNAMES+=("$name"); PPIDS+=($!)
}
pjoin() {
  local t0="$1" i rc wall sum=0
  for i in "${!PPIDS[@]}"; do
    wait "${PPIDS[$i]}"
    read -r rc wall <"$LOGS/${PNAMES[$i]}.result" 2>/dev/null || { rc=1; wall=0; }
    sum=$(( sum + wall ))
    if [ "$rc" = 0 ]; then record "${PNAMES[$i]}" pass "$wall"
    else
      local log="$LOGS/${PNAMES[$i]}.log" why; [ -f "$LOGS/${PNAMES[$i]}.retry.log" ] && log="$LOGS/${PNAMES[$i]}.retry.log"
      if why="$(machine_why "$rc" "$log" "$wall")"; then record "${PNAMES[$i]}" "error: machine ($why)" "$wall"
      else record "${PNAMES[$i]}" FAIL "$wall"; fi
      echo "---- ${PNAMES[$i]} failed; last lines:"; tail -n 25 "$LOGS/${PNAMES[$i]}.log"
    fi
  done
  local phase=$(( $(now) - t0 ))
  timing_log kind=phase tool=ci-local phase=browser wall_s="$phase" background_s="$sum" steps="$(IFS=,; echo "${PNAMES[*]}")"
  PNAMES=(); PPIDS=()
}

# The tooling self-tests (the CI, lock, hook and guard scripts' own tests) run only when the change
# touches scripts/ or .claude/ (where those scripts, the timing log and the perf budget live) or the
# package files and vite.config.js (the tools' dependencies and dev servers); the main guard
# (CI_FULL=1) runs them on every main commit.
tool_changes=1
if [ "${CI_FULL:-}" != 1 ]; then
  tool_mb="$(git merge-base "$BASE" HEAD 2>/dev/null)" || tool_mb=""
  if [ -n "$tool_mb" ] && ! { git diff --name-only --no-renames "$tool_mb"; git ls-files --others --exclude-standard; } | grep -qE '^(scripts/|\.claude/|package\.json$|package-lock\.json$|vite\.config\.js$)'; then
    tool_changes=0
  fi
fi
tool_step() { # <name> <command...>
  if [ "$tool_changes" = 1 ]; then step "$@"
  else record "$1" "skipped: no tooling changes" 0; timing_log kind=step tool=ci-local step="$1" skipped=1 wall_s=0 exit=0; fi
}

# Dependencies: a clean install unless node_modules already matches the lockfile.
# npm ci empties a symlinked node_modules's target, so a shared link is dropped first.
deps() {
  if [ -d node_modules ] && npm ls --depth=0 >/dev/null 2>&1; then return 0; fi
  if [ -L node_modules ]; then rm node_modules; fi
  npm ci
}
step deps deps
tracked_modules() { test -z "$(git ls-files node_modules)" || { echo "node_modules is tracked by git"; return 1; }; }
step no-node-modules tracked_modules
# A parse check of every script, so a syntax error fails in seconds with its file and line.
syntax() {
  local failed=0
  while IFS= read -r f; do node --check "$f" || failed=1; done < <(git ls-files 'src/**.js' 'src/**.mjs' 'scripts/**.js' 'scripts/**.mjs' 'blender/**.mjs')
  return $failed
}
step syntax syntax
tool_step ci-classify bash "$SELF/ci-classify.test.sh"
tool_step render-lock bash "$SELF/render-lock-held.test.sh"
tool_step with-render-lock bash "$SELF/with-render-lock.test.sh"
tool_step ci-bot-check bash "$SELF/ci-bot-check.test.sh"
tool_step review-carry bash "$SELF/review-carry.test.sh"
tool_step golden-resolve bash "$SELF/golden-resolve.test.sh"
tool_step claude-hooks bash "$SELF/hooks/claude/test.sh"
tool_step main-guard bash "$SELF/main-guard.test.sh"
tool_step gl node "$SELF/lib/gl.test.mjs"
tool_step ci-capacity bash "$SELF/ci-capacity.test.sh"

# The balance suite is the slow one; start it now and collect it at the end.
# ...unless the change cannot move the game's balance: every changed path (commits since the base,
# uncommitted edits and new files) matches scripts/ci-balance-skip-paths. The list and the classifier
# come from the base, and any doubt (no list, no classifier, nothing to compare) runs the suite.
# CI_FULL=1 (the main guard) always runs it.
bal_mode=full
if [ "${CI_FULL:-}" != 1 ] && git show "$BASE:scripts/ci-balance-skip-paths" >"$LOGS/bal-skip" 2>/dev/null \
  && git show "$BASE:scripts/ci-classify.sh" >"$LOGS/classify.sh" 2>/dev/null \
  && bal_mb="$(git merge-base "$BASE" HEAD 2>/dev/null)"; then
  bal_mode="$({ git diff --name-only --no-renames "$bal_mb"; git ls-files --others --exclude-standard; } | bash "$LOGS/classify.sh" "$LOGS/bal-skip")"
fi
# Vitest defaults to a worker per core, so a few runs at once (several PRs gating, or balance beside
# test:fast) oversubscribe the machine and slow bot-run tests past their timeout. Each run takes its
# share of the cores the load leaves free (vitest_workers), read when test:fast starts.
VITEST_WORKERS="${VITEST_WORKERS:-}"
# The suite is deterministic in its inputs: the sim and its data (which import nothing else), the
# balance test and its worker, the test config, the lockfile and Node. A pass is recorded under that
# hash, and the same inputs later skip the suite (a retest, or main moving without touching the sim).
# HITL_NO_CHECK_CACHE=1 turns this off, as it does for the render checks.
BAL_CACHE="$HOME/.cache/hitl-ci/balance"
balance_hash() {
  { node --version
    find src/sim src/data tests/sim/balance.test.js tests/sim/balance-worker.js vite.config.js package-lock.json -type f 2>/dev/null \
      | LC_ALL=C sort | xargs sha256sum
  } | sha256sum | cut -c1-32
}
bal_hash=""; bal_passed=""
if [ "$bal_mode" != light ] && [ "${HITL_NO_CHECK_CACHE:-}" != 1 ]; then
  bal_hash="$(balance_hash 2>/dev/null)" || bal_hash=""
  [ -n "$bal_hash" ] && [ -f "$BAL_CACHE/$bal_hash.pass" ] && bal_passed="$(cat "$BAL_CACHE/$bal_hash.pass")"
  [ -n "$bal_hash" ] && timing_log kind=cache tool=test:balance cache="$([ -n "$bal_passed" ] && echo hit || echo miss)" input="$bal_hash"
fi
bal_t0=$(now)
if [ "$bal_mode" = light ]; then
  echo "test:balance: skipped: no sim changes"
elif [ -n "$bal_passed" ]; then
  echo "test:balance: skipped: these sim inputs passed on ${bal_passed:-an earlier run}"
else
  (
    me=$BASHPID; c0=$(timing_child_cpu "$me"); t0=$(now); rc=0
    npm run test:balance || rc=$?
    timing_log kind=step tool=ci-local step=test:balance wall_s=$(( $(now) - t0 )) cpu_s="$(awk -v a="$(timing_child_cpu "$me")" -v b="$c0" 'BEGIN { printf "%.2f", a - b }')" exit=$rc
    if [ $rc -eq 0 ] && [ -n "$bal_hash" ]; then
      { mkdir -p "$BAL_CACHE" && git rev-parse --short HEAD >"$BAL_CACHE/$bal_hash.pass"; } 2>/dev/null || true
    fi
    exit $rc
  ) >"$LOGS/test:balance.log" 2>&1 &
  bal_pid=$!
fi

if [ -z "$VITEST_WORKERS" ]; then
  VITEST_WORKERS="$(vitest_workers "$(nproc)" "$(load1)" "$(ci_runs_going)")"
  timing_log kind=vitest tool=ci-local workers="$VITEST_WORKERS" cores="$(nproc)" load1="$(load1)" runs="$(ci_runs_going)"
fi
step test:fast npm run test:fast -- --maxWorkers="$VITEST_WORKERS"
step build npm run build
# Render checks, ten minutes at most per pass, each under a render lock (scripts/with-render-lock.sh)
# whose wait does not count against the ten minutes:
#   render-checks  clipping with and without the rig, standups, and (unless CI_SKIP_SWEEP=1) the scene sweep (new violations in
#                  mocks and props fail; seed-only ones are advisory), on the GPU (a GPU slot). They
#                  check geometry and behaviour, not exact pixels.
#   golden         the golden images, on SwiftShader under the software lock: only software GL draws
#                  the same pixels on every machine. GOLDEN_JOBS browsers render at once.
# A run can lose a page to vite reloading while it optimizes a dependency, so a failed pass is
# retried once; a real failure fails both. A retry is reported in the summary (and so in the PR
# comment) with the first pass's error.
GOLDEN_JOBS="${GOLDEN_JOBS:-4}"
render_pass() { # <gpu|software> <command>
  HITL_GL="$1" bash "$SELF/with-render-lock.sh" "--$1" timeout 600 bash -c "$2"
}
render_step() { # <name> <gpu|software> <command>
  local name="$1" mode="$2" pass="$3" first="$LOGS/$1.first.log"
  render_pass "$mode" "$pass" >"$first" 2>&1; local rc=$?
  cat "$first"
  local waited; waited="$(grep -o 'waited [1-9][0-9]*s for [a-zA-Z -]*' "$first" | head -1)"
  [ -n "$waited" ] && note "$name $waited"
  [ $rc -eq 0 ] && return 0
  # A lock wait that runs out (30 minutes by default) exits 75: nothing rendered, so nothing to retry.
  if [ $rc -eq 75 ]; then note "$name: timed out waiting for the $mode render lock"; return 75; fi
  echo "$name: first pass failed; retrying once"
  local why; why="$(grep -m1 -E 'Error|FAIL|failed' "$first" | cut -c1-200)"
  # A machine that ran out of something gets a moment to recover first.
  infra_failure "$first" 999 >/dev/null && sleep "${CI_INFRA_RETRY_WAIT:-20}"
  render_pass "$mode" "$pass" >"$LOGS/$name.retry.log" 2>&1; rc=$?
  cat "$LOGS/$name.retry.log"
  if [ $rc -eq 75 ]; then note "$name: timed out waiting for the $mode render lock (on the retry)"; return 75; fi
  if [ $rc -eq 0 ]; then
    note "$name passed only on its retry. First pass: ${why:-exit without a message}"
    return 0
  fi
  note "$name failed twice. First pass: ${why:-exit without a message}"
  return 1
}
# The render checks run side by side (scripts/lib/run-parallel.sh), each with its own vite cache.
# CI_SKIP_SWEEP=1 (the main guard, which runs its own strict sweep) leaves the sweep out.
render_parts="'clip=node blender/checks/clip.mjs' 'clip-rig=node blender/checks/clip.mjs --rig' 'standup=node blender/checks/standup.mjs'"
# loop: staged decision moments play through the real game loop while the game is frozen.
[ -f blender/checks/loop.mjs ] && render_parts+=" 'loop=node blender/checks/loop.mjs'"
[ "${CI_SKIP_SWEEP:-}" = 1 ] || render_parts+=" 'sweep=node blender/checks/sweep.mjs --gpu --out shots/sweep'"
# Renderer counts (draw calls, triangles, programs, textures) against scripts/perf/budget.json: exact
# on any machine, so they can gate; timing is never checked here. A production build per run, on a GPU slot.
perf_budget() {
  [ -f scripts/perf/bench.js ] || { echo "no scripts/perf in this tree"; return 0; }
  timeout 600 node scripts/perf/bench.js --scenes garage,floor,hq,music --quality low,high --runs 1 --warmup 2 --seconds 1 --json "$LOGS/perf-counts.json" \
    && node scripts/perf/budget.js "$LOGS/perf-counts.json" --counts-only
}
# Phone and tablet playability (scripts/phone-check.js, on a GPU slot), for changes that can affect
# touch play: the UI, audio, the page, the game loop, quality defaults, and the render code that takes
# pointer input or picks (build.js places by tap, camera.js drags and pinches, index.js picks).
phone_check() {
  [ -f scripts/phone-check.js ] || { echo "skipped: no scripts/phone-check.js in this tree"; return 0; }
  local mb files
  mb="$(git merge-base "$BASE" HEAD 2>/dev/null)" || mb=""
  files="$({ [ -n "$mb" ] && git diff --name-only --no-renames "$mb"; git ls-files --others --exclude-standard; })"
  if ! grep -qE '^(src/ui/|src/audio/|index\.html$|src/main\.js$|src/quality\.js$|src/render/(build|camera|index)\.js$)' <<<"$files"; then
    echo "skipped: no UI, audio, page, camera or input changes"; return 0
  fi
  timeout 900 node scripts/phone-check.js --out "$LOGS/phone"
}
# golden renders in software (SwiftShader, on the CPU), so it runs in the background while the GPU
# steps run one after another: those open many browsers each, and running them all at once exhausts
# the GPU's WebGL contexts (Chromium then blocks WebGL for the page).
browser_t0=$(now)
pstep golden render_step golden software "node blender/checks/golden.mjs --jobs=$GOLDEN_JOBS"
step lifecycle bash "$SELF/with-render-lock.sh" --gpu npm run lifecycle -- --quality low --no-shots
step soak bash "$SELF/with-render-lock.sh" --gpu npm run soak
step render-checks render_step render-checks gpu "bash '$SELF/lib/run-parallel.sh' $render_parts"
step perf-budget perf_budget
step phone-check phone_check
pjoin "$browser_t0"
commits() { "$SELF/check-commits.sh" "$(git merge-base "$BASE" HEAD)" HEAD "$TITLE"; }
step commits commits

if [ -n "$bal_passed" ]; then record test:balance "skipped: these sim inputs passed on $bal_passed" 0; timing_log kind=step tool=ci-local step=test:balance skipped=1 cached=1 wall_s=0 exit=0;
elif [ -z "$bal_pid" ]; then record test:balance "skipped: no sim changes" 0; timing_log kind=step tool=ci-local step=test:balance skipped=1 wall_s=0 exit=0;
elif wait "$bal_pid"; then record test:balance pass $(( $(now) - bal_t0 ));
else
  bal_wall=$(( $(now) - bal_t0 ))
  if why="$(infra_failure "$LOGS/test:balance.log" "$bal_wall")"; then record test:balance "error: machine ($why)" "$bal_wall"
  else record test:balance FAIL "$bal_wall"; fi
  echo "---- test:balance failed; last lines:"; tail -n 25 "$LOGS/test:balance.log"
fi

# Exit 1 when any step failed on the code; else 3 when a step failed on the machine twice; else 0.
failed=0; machine=0
table="| step | result | seconds |"$'\n'"|---|---|---|"
for i in "${!NAMES[@]}"; do
  table+=$'\n'"| ${NAMES[$i]} | ${RESULTS[$i]} | ${TIMES[$i]} |"
  case "${RESULTS[$i]}" in pass|skipped:*) ;; "error: machine"*) machine=1 ;; *) failed=1 ;; esac
done
[ $failed = 0 ] && [ $machine = 1 ] && note "Machine failures only: the machine ran out of something (disk, memory, GPU) twice. Nothing here judges the code; re-run when the machine is quieter."
tests="$(grep -hE '^ +Tests ' "$LOGS/test:fast.log" "$LOGS/test:balance.log" 2>/dev/null | sed 's/^ *//' | paste -sd ';' -)"
notes=""
NOTES=(); [ -f "$LOGS/notes" ] && mapfile -t NOTES <"$LOGS/notes"
for n in "${NOTES[@]}"; do notes+="**Note:** $n"$'\n'; done
echo
echo "$table"
echo "vitest: $tests"
[ -n "$notes" ] && printf '\n%s' "$notes"
if [ -n "$SUMMARY" ]; then { echo "$table"; echo; echo "vitest: $tests"; [ -n "$notes" ] && printf '\n%s' "$notes"; } >"$SUMMARY"; fi
[ -n "${CI_LOGS:-}" ] || rm -rf "$LOGS"
rc=$failed; [ $failed = 0 ] && [ $machine = 1 ] && rc=3
timing_log kind=run tool=ci-local wall_s=$SECONDS exit="$rc" load1_start="$run_load0" load1_end="$(load1)" runs_start="$run_going0" slot_wait_s="${CI_SLOT_WAITED:-0}"
exit "$rc"
