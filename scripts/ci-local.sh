#!/usr/bin/env bash
# Runs locally everything the CI workflow runs, gated on exit codes, and prints a summary table.
# Usage: scripts/ci-local.sh [--base <ref>] [--title "<pr title>"] [--summary <file>]
#   --base     ref the commit check compares against (default origin/main)
#   --title    PR title for the commit check (skipped when empty)
#   --summary  also write the summary table (markdown) to this file
# The balance suite runs alongside the other steps; the rest run in order. Exit 0 only if all pass.
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
LOGS="${CI_LOGS:-$(mktemp -d)}"
declare -a NAMES RESULTS TIMES
now() { date +%s; }

record() { NAMES+=("$1"); RESULTS+=("$2"); TIMES+=("$3"); }

bal_pid=""
bal_running() { [ -n "$bal_pid" ] && kill -0 "$bal_pid" 2>/dev/null && echo 1 || echo 0; }
step() {
  local name="$1"; shift
  local t0 c0 b0 rc=0; t0=$(now); c0=$(timing_child_cpu); b0=$(bal_running)
  "$@" >"$LOGS/$name.log" 2>&1 || rc=$?
  local wall=$(( $(now) - t0 ))
  if [ $rc -eq 0 ]; then record "$name" pass "$wall";
  else record "$name" FAIL "$wall"; echo "---- $name failed; last lines:"; tail -n 25 "$LOGS/$name.log"; fi
  # CPU counts only when the background balance run did not finish (and add its own) meanwhile.
  local cpu=""
  [ "$b0" = "$(bal_running)" ] && cpu="cpu_s=$(awk -v a="$(timing_child_cpu)" -v b="$c0" 'BEGIN { printf "%.2f", a - b }')"
  timing_log kind=step tool=ci-local step="$name" wall_s="$wall" $cpu exit=$rc
}

# Dependencies: a clean install unless node_modules already matches the lockfile.
# npm ci empties a symlinked node_modules's target, so a shared link is dropped first.
deps() {
  if [ -d node_modules ] && npm ls --depth=0 >/dev/null 2>&1; then return 0; fi
  if [ -L node_modules ]; then rm node_modules; fi
  npm ci
}
step deps deps
tracked_modules() { test -z "$(git ls-files node_modules)"; }
step no-node-modules tracked_modules
# A parse check of every script, so a syntax error fails in seconds with its file and line.
syntax() {
  local failed=0
  while IFS= read -r f; do node --check "$f" || failed=1; done < <(git ls-files 'src/**.js' 'src/**.mjs' 'scripts/**.js' 'scripts/**.mjs' 'blender/**.mjs')
  return $failed
}
step syntax syntax
step ci-classify bash "$SELF/ci-classify.test.sh"
step render-lock bash "$SELF/render-lock-held.test.sh"
step with-render-lock bash "$SELF/with-render-lock.test.sh"
step ci-bot-check bash "$SELF/ci-bot-check.test.sh"
step review-carry bash "$SELF/review-carry.test.sh"
step golden-resolve bash "$SELF/golden-resolve.test.sh"
step claude-hooks bash "$SELF/hooks/claude/test.sh"
step main-guard bash "$SELF/main-guard.test.sh"
step gl node "$SELF/lib/gl.test.mjs"

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
# test:fast) oversubscribe the machine and slow bot-run tests past their timeout. Each run takes a share.
VITEST_WORKERS="${VITEST_WORKERS:-$(( $(nproc) / 3 > 4 ? $(nproc) / 3 : 4 ))}"
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

step test:fast npm run test:fast -- --maxWorkers="$VITEST_WORKERS"
step build npm run build
step lifecycle bash "$SELF/with-render-lock.sh" --gpu npm run lifecycle -- --quality low --no-shots
step soak bash "$SELF/with-render-lock.sh" --gpu npm run soak
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
NOTES=()
GOLDEN_JOBS="${GOLDEN_JOBS:-4}"
render_pass() { # <gpu|software> <command>
  HITL_GL="$1" bash "$SELF/with-render-lock.sh" "--$1" timeout 600 bash -c "$2"
}
render_step() { # <name> <gpu|software> <command>
  local name="$1" mode="$2" pass="$3" first="$LOGS/$1.first.log"
  render_pass "$mode" "$pass" >"$first" 2>&1; local rc=$?
  cat "$first"
  local waited; waited="$(grep -o 'waited [1-9][0-9]*s for [a-zA-Z -]*' "$first" | head -1)"
  [ -n "$waited" ] && NOTES+=("$name $waited")
  [ $rc -eq 0 ] && return 0
  # A lock wait that runs out (30 minutes by default) exits 75: nothing rendered, so nothing to retry.
  if [ $rc -eq 75 ]; then NOTES+=("$name: timed out waiting for the $mode render lock"); return 1; fi
  echo "$name: first pass failed; retrying once"
  local why; why="$(grep -m1 -E 'Error|FAIL|failed' "$first" | cut -c1-200)"
  render_pass "$mode" "$pass"; rc=$?
  if [ $rc -eq 75 ]; then NOTES+=("$name: timed out waiting for the $mode render lock (on the retry)"); return 1; fi
  if [ $rc -eq 0 ]; then
    NOTES+=("$name passed only on its retry. First pass: ${why:-exit without a message}")
    return 0
  fi
  NOTES+=("$name failed twice. First pass: ${why:-exit without a message}")
  return 1
}
# The four render checks run side by side (scripts/lib/run-parallel.sh), each with its own vite cache.
# CI_SKIP_SWEEP=1 (the main guard, which runs its own strict sweep) leaves the sweep out.
render_parts="'clip=node blender/checks/clip.mjs' 'clip-rig=node blender/checks/clip.mjs --rig' 'standup=node blender/checks/standup.mjs'"
[ "${CI_SKIP_SWEEP:-}" = 1 ] || render_parts+=" 'sweep=node blender/checks/sweep.mjs --gpu --out shots/sweep'"
step render-checks render_step render-checks gpu "bash '$SELF/lib/run-parallel.sh' $render_parts"
step golden render_step golden software "node blender/checks/golden.mjs --jobs=$GOLDEN_JOBS"
# Renderer counts (draw calls, triangles, programs, textures) against scripts/perf/budget.json: exact
# on any machine, so they can gate; timing is never checked here. A production build per run, on a GPU slot.
perf_budget() {
  [ -f scripts/perf/bench.js ] || { echo "no scripts/perf in this tree"; return 0; }
  timeout 600 node scripts/perf/bench.js --scenes garage,floor,hq,music --quality low,high --runs 1 --warmup 2 --seconds 1 --json "$LOGS/perf-counts.json" \
    && node scripts/perf/budget.js "$LOGS/perf-counts.json" --counts-only
}
step perf-budget perf_budget
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
step phone-check phone_check
commits() { "$SELF/check-commits.sh" "$(git merge-base "$BASE" HEAD)" HEAD "$TITLE"; }
step commits commits

if [ -n "$bal_passed" ]; then record test:balance "skipped: these sim inputs passed on $bal_passed" 0; timing_log kind=step tool=ci-local step=test:balance skipped=1 cached=1 wall_s=0 exit=0;
elif [ -z "$bal_pid" ]; then record test:balance "skipped: no sim changes" 0; timing_log kind=step tool=ci-local step=test:balance skipped=1 wall_s=0 exit=0;
elif wait "$bal_pid"; then record test:balance pass $(( $(now) - bal_t0 ));
else record test:balance FAIL $(( $(now) - bal_t0 )); echo "---- test:balance failed; last lines:"; tail -n 25 "$LOGS/test:balance.log"; fi

failed=0
table="| step | result | seconds |"$'\n'"|---|---|---|"
for i in "${!NAMES[@]}"; do
  table+=$'\n'"| ${NAMES[$i]} | ${RESULTS[$i]} | ${TIMES[$i]} |"
  case "${RESULTS[$i]}" in pass|skipped:*) ;; *) failed=1 ;; esac
done
tests="$(grep -hE '^ +Tests ' "$LOGS/test:fast.log" "$LOGS/test:balance.log" 2>/dev/null | sed 's/^ *//' | paste -sd ';' -)"
notes=""
for n in "${NOTES[@]}"; do notes+="**Note:** $n"$'\n'; done
echo
echo "$table"
echo "vitest: $tests"
[ -n "$notes" ] && printf '\n%s' "$notes"
if [ -n "$SUMMARY" ]; then { echo "$table"; echo; echo "vitest: $tests"; [ -n "$notes" ] && printf '\n%s' "$notes"; } >"$SUMMARY"; fi
[ -n "${CI_LOGS:-}" ] || rm -rf "$LOGS"
timing_log kind=run tool=ci-local wall_s=$SECONDS exit="$failed"
exit "$failed"
