#!/usr/bin/env bash
# The gate a PR passes (GitHub's `smoke` check, and `npm run smoke` anywhere): quick checks that catch
# what a change most often breaks, in a few minutes. The whole suite (balance, browser, render, golden,
# phone and the tool self-tests) runs only when a release is cut (scripts/release.sh).
#   syntax      every .js and .mjs the change touches parses
#   related     the tests that import the changed JS (scripts/test-push.sh), at most HITL_SMOKE_TEST_CAP
#               (default 40), the most relevant first; the output says CAPPED when it cuts
#   features    docs/features ids match the data (scripts/features-ids.mjs)
#   toolkit     every script has a docs/toolkit entry (npm run toolkit -- --check)
#   build       a production build (npm run build)
# Every step runs; the table at the end lists them slowest first, then each failed step's own error
# lines between "--- red steps ---" markers, and the exit code is 1 when one failed.
# Usage: scripts/smoke.sh [--base <ref>]   (default origin/main: what "touched" is measured against)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
base="origin/main"
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "usage: scripts/smoke.sh [--base <ref>]" >&2; exit 2 ;;
  esac
done
mb="$(git merge-base "$base" HEAD 2>/dev/null || echo HEAD)"
rows=(); failed=0; red=()
mkdir -p "$HOME/.cache/hitl-ci/tmp"
logs="$(mktemp -d "$HOME/.cache/hitl-ci/tmp/smoke.XXXXXX")"; trap 'rm -rf "$logs"' EXIT
step() { # <name> <command...>
  local name="$1" t0 rc; shift
  echo "== $name"
  t0=$SECONDS
  "$@" 2>&1 | tee "$logs/$name.log"; rc=${PIPESTATUS[0]}
  rows+=("$(( SECONDS - t0 )) $name $([ "$rc" = 0 ] && echo pass || echo FAIL)")
  [ "$rc" = 0 ] || { failed=1; red+=("$name"); }
}
syntax() {
  local f rc=0
  while IFS= read -r f; do [ -f "$f" ] && { node --check "$f" || { echo "FAIL: $f does not parse"; rc=1; }; }; done \
    < <({ git diff --name-only --no-renames "$mb"; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.(js|mjs)$' || true)
  return $rc
}
step syntax syntax
step related bash scripts/test-push.sh --cap "${HITL_SMOKE_TEST_CAP:-40}"
step features node scripts/features-ids.mjs --root "$PWD"
step toolkit npm run --silent toolkit -- --check
step build npm run --silent build
echo
echo "| step | result | seconds |"
echo "|---|---|---|"
printf '%s\n' "${rows[@]}" | sort -rn | while read -r s n r; do echo "| $n | $r | $s |"; done
echo "smoke: ${SECONDS}s in all"
# Each red step's own failure lines (its tail when it prints none), so nobody re-runs to see why.
if [ ${#red[@]} -gt 0 ]; then
  echo "--- red steps ---"
  for name in "${red[@]}"; do
    lines="$(grep -E '^ *FAIL|[^a-z]FAIL[: ]|Error|×' "$logs/$name.log" | head -n 40)"
    [ -n "$lines" ] || lines="$(tail -n 25 "$logs/$name.log")"
    echo "$name failed:"; echo "$lines"
  done
  echo "--- end red steps ---"
fi
exit $failed
