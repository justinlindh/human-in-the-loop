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
  "pr merge") echo "$3" >>"$T/merged"; [ ! -e "$T/merge-refuses" ] ;;
  "pr view") cat "$T/files-$3" 2>/dev/null ;;
  api*) echo "$*" >>"$T/api" ;;
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
export T="$tmp" FIXTURE="$tmp/prs.json" AUTO_CI_STATE="$tmp/state" AUTO_CI_GH="$tmp/gh" AUTO_CI_PR="$tmp/ci-pr" AUTO_CI_TREE="$tmp" AUTO_CI_JOBS=2 AUTO_CI_TMP="$tmp/tmpfs" AUTO_CI_NPM="$tmp/npm" AUTO_CI_GUARD_RED="$tmp/red" AUTO_CI_TMP_FREE_GB=100 AUTO_CI_MEM_FREE_GB=100

pr() { # number head local-ci-state [draft] [author] [label] [review-state] [auto-merge: on]
  local ctx='[]'; [ "$3" != none ] && ctx="[{\"context\":\"local-ci\",\"state\":\"$3\"}]"
  [ -n "${7:-}" ] && ctx="$(jq -c --arg r "$7" '. + [{context: "review", state: $r}]' <<<"$ctx")"
  local lab='[]'; [ -n "${6:-}" ] && lab="[{\"name\":\"$6\"}]"
  local am=null; [ "${8:-}" = on ] && am='{"mergeMethod":"MERGE"}'
  printf '{"number":%s,"headRefOid":"%s","isDraft":%s,"isCrossRepository":false,"author":{"login":"%s"},"statusCheckRollup":%s,"labels":%s,"autoMergeRequest":%s}' \
    "$1" "$2" "${4:-false}" "${5:-justinlindh}" "$ctx" "$lab" "$am"
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
grep -q "statuses/ggg -f state=pending" "$tmp/api" 2>/dev/null || fail "a retry should mark local-ci pending"
grep -q "statuses/hhh" "$tmp/api" 2>/dev/null && fail "a failure that is not rerun should keep its status"
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
grep -q "statuses/jjj -f state=pending -f context=local-ci" "$tmp/api" 2>/dev/null || fail "a ci-rerun pickup should mark local-ci pending"

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
# ci-rerun starts a held render PR (a render fix for main's red), and the label comes off.
fixture "$(pr 30 r30 none false justinlindh ci-rerun)"
run
has started "30 r30" || fail "ci-rerun should start a render PR held by main's red"
grep -q "pr edit 30 --remove-label ci-rerun" "$tmp/edits" 2>/dev/null || fail "ci-rerun should come off when the held PR starts"
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
sed -i '/^30 r30$/d' "$tmp/started"
# A red file older than AUTO_CI_RED_HOURS holds nothing.
touch -d '4 hours ago' "$tmp/red"
fixture "$(pr 33 r33 none)"
printf 'src/render/sync.js\n' >"$tmp/files-33"
run
has started "33 r33" || fail "a stale red file should not hold render PRs"
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
echo "abc1234 test:fast" >"$tmp/red"
fixture "$(pr 30 r30 none)"
run
has started "30 r30" || fail "a render PR should run when main is red only off the render"
rm -f "$tmp/red"
# PRs that passed review go first; changes requested go last.
for f in "$tmp"/state/jobs/*; do [ -e "$f" ] && read -r p _ <"$f" && kill -KILL -- "-$p" 2>/dev/null; done; sleep 0.3
: >"$tmp/started"
fixture "$(pr 40 a40 none false justinlindh '' FAILURE)" "$(pr 41 a41 none)" "$(pr 42 a42 none false justinlindh '' SUCCESS)" "$(pr 43 a43 none false justinlindh '' SUCCESS)"
run
# The two jobs of one pass append their own lines, in either order.
[ "$(head -2 "$tmp/started" | sort | tr '\n' ' ')" = "42 a42 43 a43 " ] || fail "reviewed PRs should start first (started: $(tr '\n' ' ' <"$tmp/started"))"
has started "40 a40" && fail "a PR with changes requested should wait behind the others"
# A docs-only PR starts at once, past the cap.
printf 'docs/x.md\nCLAUDE.md\n' >"$tmp/files-44"
printf 'src/sim/x.js\n' >"$tmp/files-45"
fixture "$(pr 42 a42 PENDING)" "$(pr 43 a43 PENDING)" "$(pr 44 a44 none)" "$(pr 45 a45 none)"
run
has started "44 a44" || fail "a docs-only PR should start past the cap"
has started "45 a45" && fail "a full PR should still wait for the cap"
grep -q "start #44 a44 (new head, docs only)" "$tmp/state/log" || fail "the log should say the run is docs only"

# Auto-merge goes on for a ready PR without it, once per head; drafts, awaiting-user, outside authors
# and PRs that already have it are left alone.
: >"$tmp/merged"
fixture "$(pr 50 a50 SUCCESS)" "$(pr 51 a51 SUCCESS true)" "$(pr 52 a52 SUCCESS false justinlindh awaiting-user)" \
  "$(pr 53 a53 SUCCESS false someone)" "$(pr 54 a54 SUCCESS false justinlindh '' '' on)"
run
[ "$(tr '\n' ' ' <"$tmp/merged")" = "50 " ] || fail "only #50 should get auto-merge (got: $(tr '\n' ' ' <"$tmp/merged"))"
grep -q "#50 a50: auto-merge was off; turned it on" "$tmp/state/log" || fail "the log should say auto-merge was turned on"
run
[ "$(count merged)" -eq 1 ] || fail "auto-merge should be tried once per head"
touch "$tmp/merge-refuses"
fixture "$(pr 50 b50 SUCCESS)"
run; run
[ "$(grep -c '^50$' "$tmp/merged")" -eq 2 ] || fail "a new head should be tried once, even when gh refuses"
grep -q "#50 b50: auto-merge was off and turning it on failed" "$tmp/state/log" || fail "the log should say turning auto-merge on failed"
rm -f "$tmp/merge-refuses"

# Vitest's leftover temp directories over an hour old go; recent ones and anything else stay.
mkdir -p "$tmp/tmpfs/AbCdEfGhIjKlMnOpQrStU/ssr" "$tmp/tmpfs/ZyXwVuTsRqPoNmLkJiHgF/ssr" "$tmp/tmpfs/keep-me-not-vitest-x/ssr" "$tmp/tmpfs/AAAAAAAAAAAAAAAAAAAAA/other"
touch -d '2 hours ago' "$tmp/tmpfs/AbCdEfGhIjKlMnOpQrStU" "$tmp/tmpfs/keep-me-not-vitest-x" "$tmp/tmpfs/AAAAAAAAAAAAAAAAAAAAA"
fixture
run
[ -e "$tmp/tmpfs/AbCdEfGhIjKlMnOpQrStU" ] && fail "an old vitest temp directory should be cleared"
[ -e "$tmp/tmpfs/ZyXwVuTsRqPoNmLkJiHgF" ] || fail "a recent vitest temp directory should stay"
[ -e "$tmp/tmpfs/keep-me-not-vitest-x" ] || fail "a directory not named like vitest's should stay"
[ -e "$tmp/tmpfs/AAAAAAAAAAAAAAAAAAAAA" ] || fail "a directory holding more than ssr should stay"

# A listed lane app's PR starts like the owner's; another app's doesn't.
: >"$tmp/started"
fixture "$(pr 20 bot1 none false app/loop-reviewer-justinlindh)" "$(pr 21 bot2 none false app/other-app)"
run
has started "20 bot1" || fail "a listed app's PR should start"
has started "21 bot2" && fail "an unlisted app's PR should not start"

# Admission floor: low tmp space or low memory holds a PR that needs a run.
: >"$tmp/started"; rm -f "$tmp/state/jobs"/* "$tmp/state/retried"/* "$tmp/state/pending"/*
fixture "$(pr 30 floor1 none)"
AUTO_CI_TMP_FREE_GB=1 run
has started "30 floor1" && fail "a PR should wait while tmp is under its floor"
grep -q "waits: tmp has 1G free" "$tmp/state/log" || fail "the log should say tmp is low"
AUTO_CI_MEM_FREE_GB=2 run
has started "30 floor1" && fail "a PR should wait while memory is under its floor"
grep -q "waits: 2G of memory available" "$tmp/state/log" || fail "the log should say memory is low"
run
has started "30 floor1" || fail "a PR should start once tmp and memory are above the floors"

[ $fails -eq 0 ] && echo "auto-ci: all cases pass" || echo "auto-ci: $fails failing"
[ $fails -eq 0 ]
