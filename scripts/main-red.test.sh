#!/usr/bin/env bash
# Cases for scripts/main-red.sh with a stand-in gh that records its calls. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
# issue list prints $OPEN (an issue number, or nothing); api answers the tip, the subject and the jobs.
cat >"$tmp/bin/gh" <<'SH'
#!/usr/bin/env bash
echo "$*" >>"$CALLS"
case "$1 $2" in
  "issue list") echo "${OPEN:-}" ;;
  "api repos/o/r/commits/main") echo "${TIP:-tipsha}" ;;
  "api repos/o/r/commits/"*) echo "fix: something" ;;
  "api repos/o/r/actions/runs/"*) printf -- '- test: https://x/job/1\n- browser: https://x/job/2' ;;
esac
SH
chmod +x "$tmp/bin/gh"
run() { : >"$tmp/calls"; ( export PATH="$tmp/bin:$PATH" CALLS="$tmp/calls" REPO=o/r RUN_ID=7 RUN_URL=https://x/run/7 "$@"; bash "$HERE/main-red.sh" ) >"$tmp/out" 2>&1; }

run SHA=tipsha CONCLUSION=failure OPEN=
grep -q '^issue create .*--label main-red' "$tmp/calls" && grep -q 'ci failed on main at tipsha' "$tmp/calls" && grep -q 'test: https://x/job/1' "$tmp/calls" \
  || fail "a red run with no open issue opens one naming the commit and the jobs: $(cat "$tmp/calls")"
grep -q '^<!-- main-red:ci -->$' "$tmp/calls" && grep -q '^issue list .*main-red:ci' "$tmp/calls" || fail "the issue carries a marker and lookups match it, so the main guard's own main-red issue is never touched: $(cat "$tmp/calls")"
run SHA=tipsha CONCLUSION=failure OPEN=41
grep -q '^issue comment 41 ' "$tmp/calls" && ! grep -q '^issue create' "$tmp/calls" || fail "a red run with an open issue comments on it: $(cat "$tmp/calls")"
run SHA=tipsha CONCLUSION=success OPEN=41 TIP=tipsha
grep -q '^issue close 41 ' "$tmp/calls" || fail "a green run on the tip closes the issue: $(cat "$tmp/calls")"
run SHA=oldsha CONCLUSION=success OPEN=41 TIP=tipsha
! grep -q '^issue close' "$tmp/calls" || fail "a green run of an older commit closes nothing: $(cat "$tmp/calls")"
run SHA=tipsha CONCLUSION=success OPEN= TIP=tipsha
! grep -qE '^issue (create|close|comment)' "$tmp/calls" || fail "a green run with no open issue does nothing: $(cat "$tmp/calls")"
run SHA=tipsha CONCLUSION=cancelled OPEN=41
! grep -qE '^issue (create|close|comment)' "$tmp/calls" && grep -q 'nothing to report' "$tmp/out" || fail "a cancelled run reports nothing: $(cat "$tmp/calls")"
( export PATH="$tmp/bin:$PATH" CALLS="$tmp/calls" REPO=o/r RUN_ID=7 RUN_URL=u SHA=s; unset CONCLUSION; bash "$HERE/main-red.sh" ) >/dev/null 2>&1
[ $? -ne 0 ] || fail "a missing CONCLUSION is an error"

[ $fails -eq 0 ] && echo "main-red: all cases pass"
exit $fails
