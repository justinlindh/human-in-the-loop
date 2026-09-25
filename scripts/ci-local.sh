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
LOGS="$(mktemp -d)"
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
bal_t0=$(now); bal_pid=""
if [ "$bal_mode" = light ]; then
  echo "test:balance: skipped: no sim changes"
else
  npm run test:balance >"$LOGS/test:balance.log" 2>&1 &
  bal_pid=$!
fi

step test:fast npm run test:fast
step build npm run build
step lifecycle npm run lifecycle -- --quality low --no-shots
step soak npm run soak
# Render checks (headless SwiftShader, deterministic): clipping with and without the rig,
# standups indoors, and the golden images. Ten minutes at most per pass.
# SwiftShader renders on the CPU with every core, so concurrent runs on one machine starve each
# other into timeouts: a pass holds a machine-wide lock, and its ten minutes start once it has it.
# A run can lose a page to vite reloading while it optimizes a dependency, so a failed pass is
# retried once; a real failure fails both.
# A retry is reported in the summary (and so in the PR comment) with the first pass's error.
NOTES=()
RENDER_LOCK="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}/render-checks.lock"
# Re-entrant: the holder exports its PID as HITL_RENDER_LOCK_HELD, and a nested taker whose
# ancestor holds the lock (render-lock-held.sh) runs straight through instead of waiting on itself.
render_pass() {
  if bash "$SELF/render-lock-held.sh" "$RENDER_LOCK"; then timeout 600 bash -c "$1"; return; fi
  mkdir -p "$(dirname "$RENDER_LOCK")"
  local t0; t0=$(now)
  flock -w "${RENDER_LOCK_WAIT:-1800}" -E 75 "$RENDER_LOCK" bash -c 'export HITL_RENDER_LOCK_HELD=$$; echo "render-checks: waited $(( $(date +%s) - '"$t0"' ))s for the render lock"; timeout 600 bash -c "$0"' "$1"
}
render_checks() {
  local pass='node blender/checks/clip.mjs && node blender/checks/clip.mjs --rig && node blender/checks/standup.mjs && node blender/checks/golden.mjs'
  local first="$LOGS/render-checks.first.log"
  render_pass "$pass" >"$first" 2>&1; local rc=$?
  cat "$first"
  [ $rc -eq 0 ] && return 0
  # flock exits 75 when the wait (30 minutes by default) runs out: nothing rendered, so there is nothing to retry.
  if [ $rc -eq 75 ]; then NOTES+=("render-checks: timed out waiting for the render lock"); return 1; fi
  echo "render-checks: first pass failed; retrying once"
  local why; why="$(grep -m1 -E 'Error|FAIL|failed' "$first" | cut -c1-200)"
  render_pass "$pass"; rc=$?
  if [ $rc -eq 75 ]; then NOTES+=("render-checks: timed out waiting for the render lock (on the retry)"); return 1; fi
  if [ $rc -eq 0 ]; then
    NOTES+=("render-checks passed only on its retry. First pass: ${why:-exit without a message}")
    return 0
  fi
  NOTES+=("render-checks failed twice. First pass: ${why:-exit without a message}")
  return 1
}
step render-checks render_checks
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
rm -rf "$LOGS"
exit "$failed"
