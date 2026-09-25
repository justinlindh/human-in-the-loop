#!/usr/bin/env bash
# Cases for scripts/main-guard.sh, with a stand-in gh and stand-in runs. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
tmp="$(mktemp -d)"; bg=""
trap '[ -n "$bg" ] && { pkill -P "$bg" 2>/dev/null; kill "$bg" 2>/dev/null; }; rm -rf "$tmp"; git -C "$REPO" worktree prune' EXIT
mkdir -p "$tmp/bin"
# GH_OPEN holds "label number" lines: the open issue per label.
cat >"$tmp/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >>"$GH_LOG"
case "$*" in
  "issue list"*) args="$*"; label="${args#*--label }"; label="${label%% *}"; awk -v l="$label" '$1 == l { print $2 }' "$GH_OPEN" 2>/dev/null ;;
  "issue create"*) echo "https://github.com/o/r/issues/99" ;;
esac
GH
chmod +x "$tmp/bin/gh"
fails=0
PASS='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n" >"$SUMMARY"'
FAIL_BAL='printf "| step | result | seconds |\n|---|---|---|\n| test:fast | pass | 1 |\n| test:balance | FAIL | 9 |\n" >"$SUMMARY"; exit 1'
report() { # <status> <states json>: a stand-in strict sweep writing one violation
  echo "printf '{\"violations\":[{\"key\":\"overlap|a|b\",\"status\":\"$1\",\"states\":$2}]}' >\"\$OUT/report.json\""
}
CLEAN="$(report baseline '["mock:hq"]')"
NEW_MOCK="$(report new '["mock:hq","seed:1:w303"]')"
NEW_SEED="$(report new '["seed:1:w303"]')"
BAD_PERF='echo "FAIL floor/low render x1.6 > x1.4"; exit 1'
case_root=""
guard() { # <gh log> <open file> [env assignments...] -- [guard args...]
  local log="$1" open="$2"; shift 2
  local envs=(); while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done; shift
  env GH_LOG="$log" GH_OPEN="$open" PATH="$tmp/bin:$PATH" CI_WORKTREE_ROOT="$case_root" HITL_LOCK_DIR="$tmp/locks" \
    MAIN_GUARD_PERF_EVERY=0 MAIN_GUARD_PERF='exit 0' MAIN_GUARD_PHONE='exit 0' "${envs[@]}" bash "$HERE/main-guard.sh" "$@" >"$log.out" 2>&1
}
expect() { # <name> <gh log> <patterns, | separated; !x means absent; out:x looks in the guard's output>
  local w want; IFS='|' read -ra want <<<"$3"
  for w in "${want[@]}"; do
    local f="$2" p="$w" neg=0
    case "$p" in !*) neg=1; p="${p#!}" ;; esac
    case "$p" in out:*) f="$2.out"; p="${p#out:}" ;; esac
    if grep -qF -- "$p" "$f"; then [ $neg = 1 ] && { echo "FAIL $1: unexpected $p"; fails=$((fails + 1)); }
    else [ $neg = 0 ] && { echo "FAIL $1: missing $p"; fails=$((fails + 1)); }; fi
  done
}
one() { # <name> <suite> <strict> <open "label n" lines, ; separated> <patterns> [extra env...]
  case_root="$tmp/root-$RANDOM"; local log="$tmp/$RANDOM.log" open="$tmp/$RANDOM.open"; : >"$log"; printf '%s' "$4" | tr ';' '\n' >"$open"
  local name="$1" suite="$2" strict="$3" pats="$5"; shift 5
  guard "$log" "$open" MAIN_GUARD_SUITE="$suite" MAIN_GUARD_STRICT="$strict" "$@" -- --sha HEAD
  expect "$name" "$log" "$pats"
}

one 'green, nothing open: success, no issue' "$PASS" "$CLEAN" '' 'state=success|!issue create|!issue close'
one 'green closes the open main-red issue' "$PASS" "$CLEAN" 'main-red 41' 'state=success|issue close 41'
one 'red opens a main-red issue' "$FAIL_BAL" "$CLEAN" '' 'state=failure|description=Red: test:balance|issue create --title main is red at|--label main-red'
one 'red again comments on the open main-red issue' "$FAIL_BAL" "$CLEAN" 'main-red 41' 'state=failure|issue comment 41|!issue create'
one 'a new violation outside seeded games makes main red' "$PASS" "$NEW_MOCK" '' 'state=failure|description=Red: sweep|--label main-red'
one 'a seed-only violation leaves main green and opens a sweep-finding issue' "$PASS" "$NEW_SEED" '' 'state=success|--label sweep-finding|!--label main-red --body'
one 'a clean sweep closes the open sweep-finding issue' "$PASS" "$CLEAN" 'sweep-finding 52' 'state=success|issue close 52'
one 'a missing sweep report fails the gate' "$PASS" 'true' '' 'state=failure|description=Red: sweep'
case_root="$tmp/root-np"; np="$tmp/np.log"; : >"$np"; : >"$tmp/np.open"
guard "$np" "$tmp/np.open" MAIN_GUARD_SUITE="$FAIL_BAL" MAIN_GUARD_STRICT="$NEW_MOCK" -- --sha HEAD --no-post
expect 'no-post posts nothing' "$np" '!statuses|!issue|out:FAIL'

# Timing: one bad run files nothing, the second in a row files an issue; a good run closes it; and it
# runs at most once per interval.
case_root="$tmp/root-perf"; pl="$tmp/perf.log"; po="$tmp/perf.open"; : >"$po"
: >"$pl"; guard "$pl" "$po" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" MAIN_GUARD_PERF="$BAD_PERF" -- --sha HEAD
expect 'one bad timing run files nothing' "$pl" '!perf-regression|out:1 run(s) in a row'
: >"$pl"; guard "$pl" "$po" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" MAIN_GUARD_PERF="$BAD_PERF" -- --sha HEAD
expect 'a second bad run in a row files perf-regression' "$pl" '--label perf-regression|state=success'
echo "perf-regression 60" >"$po"
: >"$pl"; guard "$pl" "$po" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD
expect 'a good timing run closes it' "$pl" 'issue close 60'
: >"$pl"; guard "$pl" "$po" MAIN_GUARD_PERF_EVERY=3600 MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" MAIN_GUARD_PERF="$BAD_PERF" -- --sha HEAD
expect 'timing runs at most once per interval' "$pl" '!out:timing'

# phone-check, hourly with perf: one failure files nothing, two in a row file phone-regression (main stays
# green), and a pass closes it.
case_root="$tmp/root-phone"; phl="$tmp/phone.log"; pho="$tmp/phone.open"; : >"$pho"
BAD_PHONE='echo "FAIL iphone14 placement: tap-to-place did not place"; exit 1'
: >"$phl"; guard "$phl" "$pho" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" MAIN_GUARD_PHONE="$BAD_PHONE" -- --sha HEAD
expect 'one phone-check failure files nothing' "$phl" '!phone-regression|out:fails, 1 run(s) in a row|state=success'
: >"$phl"; guard "$phl" "$pho" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" MAIN_GUARD_PHONE="$BAD_PHONE" -- --sha HEAD
expect 'a second phone-check failure files phone-regression, main stays green' "$phl" '--label phone-regression|state=success|!--label main-red --body'
echo "phone-regression 70" >"$pho"
: >"$phl"; guard "$phl" "$pho" MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD
expect 'a passing phone-check closes it' "$phl" 'issue close 70'

# Yield: while another process waits for the software lock, the guard does not start its gate.
mkdir -p "$tmp/locks"; flock "$tmp/locks/render-checks.lock" sleep 30 & bg=$!
sleep 0.3; flock "$tmp/locks/render-checks.lock" true & waiter=$!
sleep 0.3
case_root="$tmp/root-yield"; yl="$tmp/yield.log"; : >"$yl"
( guard "$yl" /dev/null MAIN_GUARD_SUITE='echo ran >"$SUMMARY"' MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD --no-post ) & g=$!
sleep 3
[ -s "$case_root/main-guard/$(git -C "$REPO" rev-parse --short=7 HEAD).md" ] && { echo "FAIL the guard ran while a job waited for the lock"; fails=$((fails + 1)); }
kill "$waiter" 2>/dev/null; pkill -P "$bg" 2>/dev/null; kill "$bg" 2>/dev/null; bg=""
for p in $(pgrep -P "$g"); do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; kill "$g" 2>/dev/null
wait 2>/dev/null

# Shared checkout: fast-forwarded when clean and idle, left alone when a ci-pr runs in it.
# A bare stand-in origin whose main is this HEAD, and a clone of it one commit behind.
git init -q --bare "$tmp/origin.git"
git -C "$REPO" push -q "$tmp/origin.git" "HEAD:refs/heads/main" 2>/dev/null
shared="$tmp/shared"; git clone -q "$tmp/origin.git" "$shared" 2>/dev/null
git -C "$shared" checkout -q -B main "$(git -C "$REPO" rev-parse HEAD~1)"
case_root="$tmp/root-sync"; sl="$tmp/sync.log"; : >"$sl"
guard "$sl" /dev/null MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" HITL_SHARED_CHECKOUT="$shared" -- --sha HEAD --no-post
[ "$(git -C "$shared" rev-parse HEAD)" = "$(git -C "$REPO" rev-parse HEAD)" ] || { echo "FAIL an idle shared checkout was not fast-forwarded"; fails=$((fails + 1)); }
git -C "$shared" reset -q --hard HEAD~1
(cd "$shared" && exec -a "bash scripts/ci-pr.sh 1" sleep 20) & busy=$!
sleep 0.3
guard "$sl" /dev/null MAIN_GUARD_SUITE="$PASS" MAIN_GUARD_STRICT="$CLEAN" HITL_SHARED_CHECKOUT="$shared" -- --sha HEAD --no-post
[ "$(git -C "$shared" rev-parse HEAD)" != "$(git -C "$REPO" rev-parse HEAD)" ] || { echo "FAIL a busy shared checkout was updated"; fails=$((fails + 1)); }
kill "$busy" 2>/dev/null

# Bisect: last green four merges back, red from the second of them on: the first red one is named.
mapfile -t fp < <(git -C "$REPO" rev-list --first-parent -n 5 HEAD)
if [ ${#fp[@]} -eq 5 ]; then
  case_root="$tmp/root-bisect"; mkdir -p "$case_root/main-guard"; echo "${fp[4]}" >"$case_root/main-guard/last-green"
  bl="$tmp/bisect.log"; : >"$bl"
  guard "$bl" /dev/null MAIN_GUARD_SUITE="git merge-base --is-ancestor ${fp[2]} HEAD && { printf '| test:balance | FAIL | 1 |\n' >\"\$SUMMARY\"; exit 1; }; true" MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD --no-post
  expect 'a red head bisects to the first red merge' "$bl" "out:bisecting 4 merges|out:first red merge ${fp[2]:0:7}"
  RED_FROM="git merge-base --is-ancestor ${fp[2]} HEAD && { printf '| test:balance | FAIL | 1 |\n' >\"\$SUMMARY\"; exit 1; }; true"
  case_root="$tmp/root-bisect2"; mkdir -p "$case_root/main-guard"; echo "${fp[4]}" >"$case_root/main-guard/last-green"
  : >"$bl"; guard "$bl" /dev/null MAIN_GUARD_SUITE="$RED_FROM" MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD
  expect 'a posted bisect comments the first red merge on the issue' "$bl" "--label main-red|First red merge since the last green|${fp[2]:0:7}"
  case_root="$tmp/root-bisect3"; mkdir -p "$case_root/main-guard"; echo "${fp[4]}" >"$case_root/main-guard/last-green"
  : >"$bl"; guard "$bl" /dev/null MAIN_GUARD_BISECT_BUDGET=0 MAIN_GUARD_SUITE="$RED_FROM" MAIN_GUARD_STRICT="$CLEAN" -- --sha HEAD
  expect 'a bisect out of time still reports red first, then the range' "$bl" "--label main-red|bisect ran out of time|out:bisect stopped"
  first_post="$(grep -n 'issue create' "$bl" | head -1 | cut -d: -f1)"; first_comment="$(grep -n 'ran out of time' "$bl" | head -1 | cut -d: -f1)"
  [ -n "$first_post" ] && [ -n "$first_comment" ] && [ "$first_post" -lt "$first_comment" ] || { echo "FAIL the red issue must be posted before the bisect note"; fails=$((fails + 1)); }
fi

[ $fails -eq 0 ] && echo "main-guard: all cases pass" || echo "main-guard: $fails failing"
[ $fails -eq 0 ]
