#!/usr/bin/env bash
# Cases for scripts/auto-ci.sh with a stand-in gh (PR list from a fixture) and a stand-in ci-pr.
# Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
cleanup() { for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; rm -rf "$tmp"; }
trap cleanup EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }

cat >"$tmp/gh" <<'SH'
#!/usr/bin/env bash
case "$1 $2" in
  "pr list") while [ $# -gt 0 ]; do [ "$1" = --jq ] && { jq -r "$2" "$FIXTURE"; exit; }; shift; done ;;
  "pr edit") echo "$*" >>"$T/edits" ;;
  "pr view") cat "$T/files-$3" 2>/dev/null ;;
esac
SH
cat >"$tmp/ci-pr" <<'SH'
#!/usr/bin/env bash
echo "$1 $3" >>"$T/started"
trap 'echo "$1 $3" >>"$T/stopped"; exit 143' TERM
sleep 30 & wait
SH
# A stand-in npm: ls passes unless $T/npm-stale exists; ci is logged.
cat >"$tmp/npm" <<'SH'
#!/usr/bin/env bash
case "$1" in ls) [ ! -e "$T/npm-stale" ] ;; ci) echo ci >>"$T/npm-ci" ;; esac
SH
chmod +x "$tmp/gh" "$tmp/ci-pr" "$tmp/npm"
export T="$tmp" FIXTURE="$tmp/prs.json" AUTO_CI_STATE="$tmp/state" AUTO_CI_GH="$tmp/gh" AUTO_CI_PR="$tmp/ci-pr" AUTO_CI_TREE="$tmp" AUTO_CI_JOBS=2 AUTO_CI_NPM="$tmp/npm" AUTO_CI_GUARD_RED="$tmp/red"

pr() { # number head local-ci-state [draft] [author] [label]
  local ctx='[]'; [ "$3" != none ] && ctx="[{\"context\":\"local-ci\",\"state\":\"$3\"}]"
  local lab='[]'; [ -n "${6:-}" ] && lab="[{\"name\":\"$6\"}]"
  printf '{"number":%s,"headRefOid":"%s","isDraft":%s,"isCrossRepository":false,"author":{"login":"%s"},"statusCheckRollup":%s,"labels":%s}' \
    "$1" "$2" "${4:-false}" "${5:-justinlindh}" "$ctx" "$lab"
}
fixture() { local IFS=,; echo "[$*]" >"$FIXTURE"; }
run() { bash "$HERE/auto-ci.sh"; sleep 0.5; }
has() { grep -qx "$2" "$tmp/$1" 2>/dev/null; }
count() { [ -f "$tmp/$1" ] && wc -l <"$tmp/$1" || echo 0; }

# New heads start, drafts, outside authors and heads with a result don't, and the job cap holds.
fixture "$(pr 1 aaa none)" "$(pr 2 bbb none true)" "$(pr 3 ccc none false someone)" "$(pr 4 ddd SUCCESS)" "$(pr 5 eee none)" "$(pr 6 fff none)"
run
has started "1 aaa" || fail "a new head should start"
has started "5 eee" || fail "a second new head should start"
has started "6 fff" && fail "a third run should wait for the cap of 2"
for x in "2 bbb" "3 ccc" "4 ddd"; do has started "$x" && fail "#${x% *} should not start"; done

# A run already going on the same head is left alone.
run
[ "$(count started)" -eq 2 ] || fail "a second pass should not start the same heads again ($(count started) starts)"

# A head that moves on stops the old run and starts the new head once there is room.
fixture "$(pr 1 aa2 none)" "$(pr 5 eee PENDING)" "$(pr 6 fff none)"
run
has stopped "1 aaa" || fail "the stale head's run should stop"
has started "1 aa2" || fail "the new head should start"
has started "6 fff" && fail "#6 should still wait: #1's new head and #5 fill the cap"

# A PR that closes or turns draft stops its run.
fixture "$(pr 1 aa2 PENDING true)" "$(pr 6 fff none)"
run
has stopped "1 aa2" || fail "a PR that turned draft should stop its run"
has stopped "5 eee" || fail "a closed PR should stop its run"
has started "6 fff" || fail "#6 should start once runs stop"

# A machine error is retried once; a failure is not.
fixture "$(pr 6 fff PENDING)" "$(pr 7 ggg ERROR)" "$(pr 8 hhh FAILURE)"
run
has started "7 ggg" || fail "an error should be retried"
has started "8 hhh" && fail "a failure should not be retried"
kill -KILL -- "-$(cut -d' ' -f1 "$tmp/state/jobs/7")" 2>/dev/null; sleep 0.3
run
[ "$(grep -c '^7 ggg$' "$tmp/started")" -eq 1 ] || fail "an error should be retried only once"

# ci-rerun waits for room with its label on, then starts a fresh run whatever the status, and the label comes off.
fixture "$(pr 6 fff PENDING)" "$(pr 9 iii none)" "$(pr 10 jjj FAILURE false justinlindh ci-rerun)"
run
has started "9 iii" || fail "#9 should start"
has started "10 jjj" && fail "ci-rerun should wait while the cap is full"
grep -q "pr edit 10" "$tmp/edits" 2>/dev/null && fail "ci-rerun should stay on while the run waits"
kill -KILL -- "-$(cut -d' ' -f1 "$tmp/state/jobs/9")" 2>/dev/null; sleep 0.3
fixture "$(pr 6 fff PENDING)" "$(pr 9 iii PENDING)" "$(pr 10 jjj FAILURE false justinlindh ci-rerun)"
run
has started "10 jjj" || fail "ci-rerun should start a run once there is room"
grep -q "pr edit 10 --remove-label ci-rerun" "$tmp/edits" 2>/dev/null || fail "ci-rerun should be removed when its run starts"

# A head left pending with no run going is retried once it has been stuck long enough, then not again.
fixture "$(pr 11 kkk PENDING)"
run
has started "11 kkk" && fail "a fresh pending head is someone else's run: leave it"
touch -d '2 hours ago' "$tmp/state/pending/kkk"
run
has started "11 kkk" || fail "a head stuck pending with no run should be retried"
kill -KILL -- "-$(cut -d' ' -f1 "$tmp/state/jobs/11")" 2>/dev/null; sleep 0.3
run
[ "$(grep -c '^11 kkk$' "$tmp/started")" -eq 1 ] || fail "a stuck head should be retried only once"

# A stale install is refreshed only while none of its runs is going.
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
: >"$tmp/npm-stale"; rm -f "$tmp/npm-ci"
fixture "$(pr 20 ttt none)"
run
[ "$(count npm-ci)" -eq 1 ] || fail "a stale install with no runs going should be reinstalled ($(count npm-ci) installs)"
fixture "$(pr 20 ttt PENDING)"
run
[ "$(count npm-ci)" -eq 1 ] || fail "a stale install should wait while a run is going ($(count npm-ci) installs)"
rm -f "$tmp/npm-stale"

# While main is red on a render step, a render-only PR waits; tooling fixes and other PRs run.
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
echo "abc1234 stage, render-checks" >"$tmp/red"
printf 'src/render/sync.js\n' >"$tmp/files-30"
printf 'src/render/sync.js\nblender/checks/harness.mjs\n' >"$tmp/files-31"
printf 'src/ui/hud.js\n' >"$tmp/files-32"
fixture "$(pr 30 r30 none)" "$(pr 31 r31 none)"
run
has started "30 r30" && fail "a render PR should wait while main is red on stage"
grep -q "#30 r30 waits: main is red on stage, render-checks" "$tmp/state/log" || fail "the wait should name main's red render steps"
has started "31 r31" || fail "a PR that also fixes tooling should run while main is red"
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
fixture "$(pr 32 r32 none)"
run
has started "32 r32" || fail "a PR outside the render should run while main is red"
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
echo "abc1234 test:fast" >"$tmp/red"
fixture "$(pr 30 r30 none)"
run
has started "30 r30" || fail "a render PR should run when main is red only off the render"
rm -f "$tmp/red"

[ $fails -eq 0 ] && echo "auto-ci: all cases pass" || echo "auto-ci: $fails failing"
[ $fails -eq 0 ]
