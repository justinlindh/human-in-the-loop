#!/usr/bin/env bash
# Runs locally everything the CI workflow runs, gated on exit codes, and prints a summary table.
# Usage: scripts/ci-local.sh [--base <ref>] [--title "<pr title>"] [--summary <file>]
#   --base     ref the commit check compares against (default origin/feat/one-shot)
#   --title    PR title for the commit check (skipped when empty)
#   --summary  also write the summary table (markdown) to this file
# The balance suite runs alongside the other steps; the rest run in order. Exit 0 only if all pass.
set -uo pipefail

BASE="origin/feat/one-shot"; TITLE=""; SUMMARY=""
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

# The balance suite is the slow one; start it now and collect it at the end.
bal_t0=$(now)
npm run test:balance >"$LOGS/test:balance.log" 2>&1 &
bal_pid=$!

step test:fast npm run test:fast
step build npm run build
step lifecycle npm run lifecycle -- --quality low --no-shots
step soak npm run soak
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
echo
echo "$table"
echo "vitest: $tests"
if [ -n "$SUMMARY" ]; then { echo "$table"; echo; echo "vitest: $tests"; } >"$SUMMARY"; fi
rm -rf "$LOGS"
exit "$failed"
