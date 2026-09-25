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
cd "${CI_DIR:-$SELF/..}"
# CI_LOGS keeps the step logs in that directory instead of a temporary one removed at the end.
LOGS="${CI_LOGS:-$(mktemp -d)}"
declare -a NAMES RESULTS TIMES
now() { date +%s; }

record() { NAMES+=("$1"); RESULTS+=("$2"); TIMES+=("$3"); }

step() {
  local name="$1"; shift
  local t0; t0=$(now)
  if "$@" >"$LOGS/$name.log" 2>&1; then record "$name" pass $(( $(now) - t0 ));
  else record "$name" FAIL $(( $(now) - t0 )); echo "---- $name failed; last lines:"; tail -n 25 "$LOGS/$name.log"; fi
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
step gl node "$SELF/lib/gl.test.mjs"

# The balance suite is the slow one; start it now and collect it at the end.
# ...unless the change cannot move the game's balance: every changed path (commits since the base,
# uncommitted edits and new files) matches scripts/ci-balance-skip-paths. The list and the classifier
# come from the base, and any doubt (no list, no classifier, nothing to compare) runs the suite.
bal_mode=full
if git show "$BASE:scripts/ci-balance-skip-paths" >"$LOGS/bal-skip" 2>/dev/null \
  && git show "$BASE:scripts/ci-classify.sh" >"$LOGS/classify.sh" 2>/dev/null \
  && bal_mb="$(git merge-base "$BASE" HEAD 2>/dev/null)"; then
  bal_mode="$({ git diff --name-only --no-renames "$bal_mb"; git ls-files --others --exclude-standard; } | bash "$LOGS/classify.sh" "$LOGS/bal-skip")"
fi
# Vitest defaults to a worker per core, so a few runs at once (several PRs gating, or balance beside
# test:fast) oversubscribe the machine and slow bot-run tests past their timeout. Each run takes a share.
VITEST_WORKERS="${VITEST_WORKERS:-$(( $(nproc) / 3 > 4 ? $(nproc) / 3 : 4 ))}"
bal_t0=$(now); bal_pid=""
if [ "$bal_mode" = light ]; then
  echo "test:balance: skipped: no sim changes"
else
  npm run test:balance >"$LOGS/test:balance.log" 2>&1 &
  bal_pid=$!
fi

step test:fast npm run test:fast -- --maxWorkers="$VITEST_WORKERS"
step build npm run build
step lifecycle bash "$SELF/with-render-lock.sh" --gpu npm run lifecycle -- --quality low --no-shots
step soak bash "$SELF/with-render-lock.sh" --gpu npm run soak
# Render checks, ten minutes at most per pass, each under a render lock (scripts/with-render-lock.sh)
# whose wait does not count against the ten minutes:
#   render-checks  clipping with and without the rig, and standups, on the GPU (a GPU slot). They
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
step render-checks render_step render-checks gpu 'node blender/checks/clip.mjs && node blender/checks/clip.mjs --rig && node blender/checks/standup.mjs'
step golden render_step golden software "node blender/checks/golden.mjs --jobs=$GOLDEN_JOBS"
commits() { "$SELF/check-commits.sh" "$(git merge-base "$BASE" HEAD)" HEAD "$TITLE"; }
step commits commits

if [ -z "$bal_pid" ]; then record test:balance "skipped: no sim changes" 0;
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
exit "$failed"
