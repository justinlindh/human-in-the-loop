#!/usr/bin/env bash
# Cases for scripts/wait-for.sh's check reading, with gh stubbed (no branch updates). Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
# gh pr view prints $tmp/pr.json; the protection lookup prints $tmp/required or fails without it;
# every call is logged to $tmp/calls.
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
echo "\$*" >>"$tmp/calls"
case "\$*" in
  "pr view"*) cat "$tmp/pr.json" ;;
  api*/protection*) [ -f "$tmp/required" ] && cat "$tmp/required" || exit 1 ;;
  api*/comments*) echo '[]' ;;
  *) exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"
pr() { # <state> <checks as name=STATE,...>: statuses for local-ci and review, check runs for the rest
  jq -n --arg st "$1" --arg c "$2" '{state: $st, headRefOid: "abc1234def", headRefName: "x/y", baseRefName: "main", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE",
    statusCheckRollup: [$c | split(",")[] | select(. != "") | split("=") | if (.[0] == "local-ci" or .[0] == "review") then {__typename: "StatusContext", context: .[0], state: .[1]} else {__typename: "CheckRun", name: .[0], status: "COMPLETED", conclusion: .[1]} end]}' >"$tmp/pr.json"
}
w() { rm -f "$tmp/calls"; PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --no-update --poll 0 --timeout 0 "$@" >"$tmp/out" 2>&1; rc=$?; }

echo '{"required_status_checks": {"contexts": ["check", "commits", "review"]}}' >"$tmp/required"
pr OPEN 'check=SUCCESS,commits=SUCCESS,review=SUCCESS'
w --repo o/site; [ $rc -eq 0 ] && grep -q -- '-R o/site' "$tmp/calls" && grep -q 'repos/o/site/branches/main/protection' "$tmp/calls" || fail "a site PR with its required checks green: $rc $(cat "$tmp/out")"
pr OPEN 'check=SUCCESS,review=SUCCESS'
w --repo o/site; [ $rc -eq 124 ] && grep -q 'waiting on: commits' "$tmp/out" || fail "a required check not reported yet keeps it waiting: $rc $(cat "$tmp/out")"
pr OPEN 'check=FAILURE,commits=SUCCESS'
w --repo o/site; [ $rc -eq 2 ] && grep -q 'check=failure' "$tmp/out" || fail "a failing check: $rc $(cat "$tmp/out")"
pr OPEN 'check=SKIPPED,commits=NEUTRAL'
w --repo o/site; [ $rc -eq 0 ] || fail "skipped and neutral check runs satisfy required checks: $rc $(cat "$tmp/out")"
PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" --help | grep -q '^Exit: 0 green' || fail "--help prints the exit codes"
pr MERGED ''
w --repo o/site; [ $rc -eq 0 ] || fail "a merged PR: $rc"

rm -f "$tmp/required"
pr OPEN 'test=SUCCESS'
w; [ $rc -eq 124 ] && grep -q 'waiting on: local-ci' "$tmp/out" && ! grep -q -- ' -R ' "$tmp/calls" || fail "without protection rules, local-ci stands in: $rc $(cat "$tmp/out")"
pr OPEN 'test=SUCCESS,local-ci=SUCCESS,review=PENDING'
w; [ $rc -eq 0 ] || fail "local-ci and checks green, review pending: $rc $(cat "$tmp/out")"

[ $fails -eq 0 ] && echo "wait-for: all cases pass"
exit $fails
