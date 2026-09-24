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

# The balance suite is the slow one; start it now and collect it at the end.
bal_t0=$(now)
npm run test:balance >"$LOGS/test:balance.log" 2>&1 &
bal_pid=$!

step test:fast npm run test:fast
step build npm run build
step lifecycle npm run lifecycle -- --quality low --no-shots
step soak npm run soak
# Render checks (headless SwiftShader, deterministic): clipping with and without the rig,
# standups indoors, and the golden images. Ten minutes at most.
# A run can lose a page to vite reloading while it optimizes a dependency, so a failed pass is
# retried once; a real failure fails both.
# A retry is reported in the summary (and so in the PR comment) with the first pass's error.
NOTES=()
render_checks() {
  local pass='node blender/checks/clip.mjs && node blender/checks/clip.mjs --rig && node blender/checks/standup.mjs && node blender/checks/golden.mjs'
  local first="$LOGS/render-checks.first.log"
  timeout 600 bash -c "$pass" >"$first" 2>&1 && { cat "$first"; return 0; }
  cat "$first"
  echo "render-checks: first pass failed; retrying once"
  local why; why="$(grep -m1 -E 'Error|FAIL|failed' "$first" | cut -c1-200)"
  if timeout 600 bash -c "$pass"; then
    NOTES+=("render-checks passed only on its retry. First pass: ${why:-exit without a message}")
    return 0
  fi
  NOTES+=("render-checks failed twice. First pass: ${why:-exit without a message}")
  return 1
}
step render-checks render_checks
commits() { "$SELF/check-commits.sh" "$(git merge-base "$BASE" HEAD)" HEAD "$TITLE"; }
step commits commits

if wait "$bal_pid"; then record test:balance pass $(( $(now) - bal_t0 ));
else record test:balance FAIL $(( $(now) - bal_t0 )); echo "---- test:balance failed; last lines:"; tail -n 25 "$LOGS/test:balance.log"; fi

failed=0
table="| step | result | seconds |"$'\n'"|---|---|---|"
for i in "${!NAMES[@]}"; do
  table+=$'\n'"| ${NAMES[$i]} | ${RESULTS[$i]} | ${TIMES[$i]} |"
  [ "${RESULTS[$i]}" = pass ] || failed=1
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
