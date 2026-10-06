#!/usr/bin/env bash
# Cases for scripts/release.sh with a stand-in suite (RELEASE_GUARD) and a stand-in gh that records its
# calls. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
git init -q -b main "$tmp/repo" && git -C "$tmp/repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "feat: a thing"
git init -q --bare "$tmp/origin.git" && git -C "$tmp/repo" remote add origin "$tmp/origin.git" && git -C "$tmp/repo" push -q origin main
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'SH'
#!/usr/bin/env bash
echo "$*" >>"$CALLS"
case "$1 $2" in
  "issue list") echo "${OPEN:-}" ;;
  "run list") echo "${RUN_ID-55}" ;;
  "run view") echo "https://x/run/55" ;;
  "run watch") exit "${WATCH_RC:-0}" ;;
esac
exit 0
SH
chmod +x "$tmp/bin/gh"
run() { # <guard output> <guard exit> [args...]
  local out="$1" rc="$2"; shift 2
  : >"$tmp/calls"
  ( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" CALLS="$tmp/calls" RELEASE_GUARD="printf '%s\n' \"$out\"; exit $rc" bash "$HERE/release.sh" "$@" ) >"$tmp/out" 2>&1
}
calls() { cat "$tmp/calls"; }

run "main-guard: abc1234 PASS in 90s" 0
rc=$?
[ $rc -eq 0 ] && calls | grep -q 'statuses/.* -f state=success -f context=release-gate' && calls | grep -q 'workflow run release.yml .*dry_run=false' \
  || fail "a green suite sets release-gate and dispatches the release: $rc $(calls)"
OPEN=7 run "main-guard: abc1234 PASS in 90s" 0
calls | grep -q '^issue close 7 ' || fail "a release clears an open release-red issue: $(calls)"

calls | grep -q '^run watch 55 ' || fail "a release waits for the workflow's result: $(calls)"
WATCH_RC=1 OPEN=7 run "main-guard: abc1234 PASS in 90s" 0
rc=$?
[ $rc -eq 1 ] && ! calls | grep -q '^issue close' && calls | grep -q '^issue comment 7 ' \
  || fail "a failed release workflow is red: no issue closed, the open one gets a comment: $rc $(calls)"
RUN_ID= RELEASE_POLL=0 run "main-guard: abc1234 PASS in 90s" 0
[ $? -eq 2 ] || fail "a run that cannot be found is an error, not a pass"

run "main-guard: abc1234 FAIL (golden,render-checks) in 120s" 1
rc=$?
[ $rc -eq 1 ] && ! calls | grep -q 'workflow run' && ! calls | grep -q 'release-gate' && calls | grep -q '^issue create .*--label release-red' && calls | grep -q 'golden,render-checks' \
  || fail "a red suite publishes nothing and opens a release-red issue naming the steps: $rc $(calls)"
OPEN=9 run "main-guard: abc1234 FAIL (phone-check) in 5s" 1
calls | grep -q '^issue comment 9 ' && ! calls | grep -q '^issue create' || fail "a second red release comments on the open issue: $(calls)"

run "main-guard: could not judge abc1234 (golden: GPU process crashed); no verdict" 2
rc=$?
[ $rc -eq 1 ] && ! calls | grep -q 'workflow run' && calls | grep -q 'GPU process crashed' || fail "an unjudged suite publishes nothing and says why: $rc $(calls)"

run "main-guard: another guard is running" 0
rc=$?
[ $rc -eq 2 ] && ! calls | grep -q 'workflow run' || fail "a busy guard is not a pass: $rc $(calls)"

run "main-guard: abc1234 PASS in 90s" 0 --dry-run
rc=$?
[ $rc -eq 0 ] && ! calls | grep -q 'release-gate' && calls | grep -q 'workflow run release.yml .*dry_run=true' || fail "a dry run sets no status and asks for the workflow's dry run: $rc $(calls)"
run "main-guard: abc1234 FAIL (golden) in 5s" 1 --dry-run
rc=$?
[ $rc -eq 1 ] && ! calls | grep -q '^issue ' && grep -q 'not opened' "$tmp/out" || fail "a red dry run opens no issue: $rc $(calls)"

run "main-guard: abc1234 PASS in 5s" 0 --bogus
[ $? -eq 2 ] || fail "an unknown option is a usage error"

[ $fails -eq 0 ] && echo "release: all cases pass"
exit $fails
