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
  "pr list"*) cat "$tmp/list.json" 2>/dev/null || exit 1 ;;
  api*/protection*) [ -f "$tmp/required" ] && cat "$tmp/required" || exit 1 ;;
  api*/comments*) echo '[]' ;;
  *) exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"
export HITL_PR_SNAPSHOT="$tmp/snap.json"  # never the real shared snapshot
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

# Without --repo the PR is polled from the shared snapshot (one pr list); a PR missing from it (merged
# or closed) falls back to pr view, and every exit is decided again on a live pr view.
echo '[{"number":9,"state":"OPEN","headRefOid":"abc1234def","headRefName":"x/y","baseRefName":"main","mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","labels":[],"comments":[],"statusCheckRollup":[{"__typename":"StatusContext","context":"local-ci","state":"PENDING"}]}]' >"$tmp/list.json"
pr OPEN 'test=SUCCESS,local-ci=PENDING'
w; [ $rc -eq 124 ] && grep -q '^pr list' "$tmp/calls" && ! grep -q '^pr view' "$tmp/calls" || fail "a waiting PR is polled from the snapshot alone: $rc $(cat "$tmp/out") $(cat "$tmp/calls")"
pr OPEN 'test=SUCCESS,local-ci=SUCCESS'
w; [ $rc -eq 124 ] || fail "green on a live read but pending in the snapshot keeps waiting: $rc $(cat "$tmp/out")"
rm -f "$tmp/snap.json"
echo '[{"number":9,"state":"OPEN","headRefOid":"0ld0ld0ld0","headRefName":"x/y","baseRefName":"main","mergeStateStatus":"CLEAN","mergeable":"MERGEABLE","labels":[],"comments":[],"statusCheckRollup":[{"__typename":"StatusContext","context":"local-ci","state":"FAILURE"}]}]' >"$tmp/list.json"
pr OPEN 'test=SUCCESS,local-ci=PENDING'
w; [ $rc -eq 124 ] && grep -q '^pr view' "$tmp/calls" && ! grep -q 'failing' "$tmp/out" || fail "a stale snapshot's old failure is not reported once a live read shows the new head pending: $rc $(cat "$tmp/out")"
[ "$(grep -c '^pr list' "$tmp/calls")" -eq 2 ] || fail "a live head the snapshot lacks refreshes the snapshot: $(cat "$tmp/calls")"
pr OPEN 'test=SUCCESS,local-ci=SUCCESS'
w; [ $rc -eq 0 ] && grep -q 'abc1234d: local-ci and every GitHub check passed' "$tmp/out" || fail "a stale snapshot's failure gives way to a live green: $rc $(cat "$tmp/out")"
rm -f "$tmp/snap.json"
echo '[]' >"$tmp/list.json"; rm -f "$tmp/snap.json"
pr MERGED ''
w; [ $rc -eq 0 ] && grep -q '^pr view' "$tmp/calls" || fail "a PR gone from the snapshot is looked up with pr view: $rc $(cat "$tmp/out")"
rm -f "$tmp/list.json" "$tmp/snap.json"

# Branch updates, in a scratch repository: a PR that is behind main gets main merged in and pushed, unless
# the worktree has been switched to another branch since the wait began.
g() { git -c user.name=t -c user.email=t@t "$@"; }
git init -q --bare -b main "$tmp/origin.git"
git clone -q "$tmp/origin.git" "$tmp/work" 2>/dev/null
( cd "$tmp/work" && g checkout -q -b main && g commit -q --allow-empty -m base && g push -q -u origin main \
  && g checkout -q -b topic && g commit -q --allow-empty -m work && g push -q -u origin topic \
  && g checkout -q -b other main && g commit -q --allow-empty -m elsewhere \
  && g checkout -q main && g commit -q --allow-empty -m "main moves" && g push -q origin main && g checkout -q topic )
# The stand-in gh reports the PR BEHIND on its first look and MERGED after.
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$*" in
  "pr view"*) if [ -f "$tmp/looked" ]; then s=MERGED; m=CLEAN; else s=OPEN; m=BEHIND; : >"$tmp/looked"; fi
    jq -n --arg s "\$s" --arg m "\$m" --arg h "\$(git -C "$tmp/work" rev-parse topic)" '{state: \$s, headRefOid: \$h, headRefName: "topic", baseRefName: "main", mergeStateStatus: \$m, mergeable: "MERGEABLE", labels: [], statusCheckRollup: [{__typename: "StatusContext", context: "review", state: "SUCCESS"}, {__typename: "StatusContext", context: "local-ci", state: "SUCCESS"}]}' ;;
  api*/protection*) exit 1 ;;
  *) exit 1 ;;
esac
F
export HITL_MERGE_QUEUE="$tmp/queue"
up() { # <test command>: run wait-for in the scratch worktree, the PR (ready: review and local-ci passed) behind main
  rm -f "$tmp/looked"; ( cd "$tmp/work" && PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --poll 0 --timeout 1 --test "$1" >"$tmp/out" 2>&1 ); rc=$?
}
before="$(git -C "$tmp/origin.git" rev-parse topic)"
up 'git checkout -q other'
[ $rc -eq 7 ] && grep -q 'was on topic when the wait began and is on other now; not pushing' "$tmp/out" && [ "$(git -C "$tmp/origin.git" rev-parse topic)" = "$before" ] \
  || fail "a worktree switched to another branch during the tests is not pushed: $rc $(cat "$tmp/out")"
( cd "$tmp/work" && g checkout -q topic )
before="$(git -C "$tmp/origin.git" rev-parse topic)"
up 'true'
[ $rc -eq 0 ] && grep -q 'pushed' "$tmp/out" && [ "$(git -C "$tmp/origin.git" rev-parse topic)" != "$before" ] \
  || fail "a worktree still on its branch is updated and pushed: $rc $(cat "$tmp/out")"

# Without --test the merge is gated on the related tests (test:push, niced) where package.json has
# that script, and on npm test where it does not. A stand-in npm records how it was called.
printf '#!/usr/bin/env bash\necho "$*" >>"%s"\n' "$tmp/npm-calls" >"$tmp/bin/npm"; chmod +x "$tmp/bin/npm"
deftest() { rm -f "$tmp/looked" "$tmp/npm-calls"; ( cd "$tmp/work" && PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --poll 0 --timeout 1 >"$tmp/out" 2>&1 ); rc=$?; }
echo '{"scripts":{"test:push":"true"}}' >"$tmp/work/package.json"
deftest
[ $rc -eq 0 ] && grep -q 'running: nice -n 10 npm run test:push' "$tmp/out" && grep -qx 'run test:push' "$tmp/npm-calls" \
  || fail "the default gate is the niced test:push: $rc $(cat "$tmp/out") calls: $(cat "$tmp/npm-calls" 2>/dev/null)"
echo '{"scripts":{"test":"true"}}' >"$tmp/work/package.json"
deftest
[ $rc -eq 0 ] && grep -q 'running: npm test' "$tmp/out" && grep -qx 'test' "$tmp/npm-calls" \
  || fail "without a test:push script the default gate is npm test: $rc $(cat "$tmp/out")"
rm -f "$tmp/work/package.json"

# Right after a push GitHub can still show the old head with its old failure: that head is an ancestor
# of the pushed origin/<branch>, so it is waited out rather than judged.
old="$(git -C "$tmp/work" rev-parse topic)"
( cd "$tmp/work" && g commit -q --allow-empty -m fix && g push -q origin topic )
new="$(git -C "$tmp/work" rev-parse topic)"
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$*" in
  "pr view"*) n=\$(( \$(cat "$tmp/views" 2>/dev/null || echo 0) + 1 )); echo \$n >"$tmp/views"
    if [ \$n -le 2 ]; then h=$old; s=OPEN; c=FAILURE; else h=$new; s=MERGED; c=SUCCESS; fi
    jq -n --arg s "\$s" --arg h "\$h" --arg c "\$c" '{state: \$s, headRefOid: \$h, headRefName: "topic", baseRefName: "main", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", labels: [],
      statusCheckRollup: [{__typename: "StatusContext", context: "local-ci", state: \$c}]}' ;;
  *) exit 1 ;;
esac
F
rm -f "$tmp/views"
( cd "$tmp/work" && HITL_WAIT_SNAPSHOT=0 PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --merged --poll 0 --timeout 1 >"$tmp/out" 2>&1 ); rc=$?
[ $rc -eq 0 ] && grep -q "GitHub still shows ${old:0:8}; waiting for the pushed ${new:0:8}" "$tmp/out" && ! grep -q failing "$tmp/out" \
  || fail "the head before a push is waited out, not judged: $rc $(cat "$tmp/out")"

# Cancelled checks: a run superseded by a newer run for the head is waited past; the newest run is
# rerun once when nothing for the head is running, and cancelled again after that, it fails.
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
echo "\$*" >>"$tmp/calls"
case "\$*" in
  "pr view"*) cat "$tmp/pr.json" ;;
  "run list"*) cat "$tmp/runs.json" ;;
  "run rerun"*) exit 0 ;;
  api*/comments*) echo '[]' ;;
  *) exit 1 ;;
esac
F
cpr() { # <check runs as name=CONCLUSION@run,...>: local-ci passed
  jq -n --arg c "$1" '{state: "OPEN", headRefOid: "abc1234def", headRefName: "x/y", baseRefName: "main", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE", labels: [],
    statusCheckRollup: ([{__typename: "StatusContext", context: "local-ci", state: "SUCCESS"}] + [$c | split(",")[] | split("@") as [$nc, $run] | ($nc | split("=")) as [$n, $s]
      | {__typename: "CheckRun", name: $n, status: "COMPLETED", conclusion: $s, detailsUrl: "https://github.com/o/r/actions/runs/\($run)/job/1"}])}' >"$tmp/pr.json"
}
runs() { jq -n --arg r "$1" '[$r | split(",")[] | split("=") as [$id, $st] | {databaseId: ($id | tonumber), status: $st, workflowName: "ci"}]' >"$tmp/runs.json"; }
cw() { rm -f "$tmp/calls"; HITL_WAIT_SNAPSHOT=0 HITL_WAIT_RERUNS="$tmp/reruns" PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --no-update --poll 0 --timeout 0 >"$tmp/out" 2>&1; rc=$?; }
rm -rf "$tmp/reruns"
cpr 'test=SUCCESS@100,balance=CANCELLED@100'; runs '101=in_progress,100=completed'
cw; [ $rc -eq 124 ] && grep -q 'balance (run 100, superseded by run 101); waiting on the newer run' "$tmp/out" && ! grep -q '^run rerun' "$tmp/calls" \
  || fail "a cancelled job in a superseded run is waited past: $rc $(cat "$tmp/out")"
cpr 'test=CANCELLED@101'; runs '101=in_progress,100=completed'
cw; [ $rc -eq 124 ] && grep -q 'still going' "$tmp/out" && ! grep -q '^run rerun' "$tmp/calls" \
  || fail "the newest run is not rerun while a run for the head is going: $rc $(cat "$tmp/out")"
cpr 'test=CANCELLED@101,balance=SUCCESS@101'; runs '101=completed,100=completed'
cw; [ $rc -eq 124 ] && grep -q '^run rerun 101 --failed' "$tmp/calls" && grep -q "rerunning run 101's cancelled jobs (once for this head)" "$tmp/out" \
  || fail "the newest run's cancelled jobs are rerun once: $rc $(cat "$tmp/out") $(cat "$tmp/calls")"
cw; [ $rc -eq 124 ] && ! grep -q '^run rerun' "$tmp/calls" || fail "a second watcher does not rerun the same head again: $rc $(cat "$tmp/calls")"
touch -d '10 minutes ago' "$tmp/reruns/9-abc1234def"
cw; [ $rc -eq 2 ] && grep -q 'run 101 was cancelled again after its one rerun' "$tmp/out" && grep -q 'test=cancelled' "$tmp/out" \
  || fail "cancelled again after its rerun, it fails: $rc $(cat "$tmp/out")"
rm -rf "$tmp/reruns"
cpr 'test=FAILURE@101,balance=CANCELLED@100'; runs '101=completed,100=completed'
cw; [ $rc -eq 2 ] && grep -q 'test=failure' "$tmp/out" && ! grep -q '^run rerun' "$tmp/calls" || fail "a real failure beside a cancellation fails at once: $rc $(cat "$tmp/out")"
cpr 'test=CANCELLED@'; runs '101=completed'
cw; [ $rc -eq 2 ] || fail "a cancelled check whose run can't be placed fails: $rc $(cat "$tmp/out")"

# The update queue (q_join in wait-for.sh): a PR that is only behind main merges it in when it is ready
# (review and local-ci passed) and first in line by the time it became ready; otherwise it waits and says
# why. An entry is kept on a timeout, and removed on a failure, changes requested or a merge.
rm -rf "$tmp/queue"; mkdir -p "$tmp/queue"
behind_gh() { # <review state, empty for none>: the PR is BEHIND; once $tmp/merged-after exists it is MERGED on the next look
  if [ -z "$1" ]; then echo '[]' >"$tmp/rollup.json"
  else jq -n --arg r "$1" '[{__typename: "StatusContext", context: "review", state: $r}, {__typename: "StatusContext", context: "local-ci", state: "SUCCESS"}]' >"$tmp/rollup.json"; fi
  cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$*" in
  "pr view"*) if [ -f "$tmp/merged-after" ] && [ -f "$tmp/looked" ]; then s=MERGED; m=CLEAN; else s=OPEN; m=BEHIND; : >"$tmp/looked"; fi
    jq -n --arg s "\$s" --arg m "\$m" --arg h "\$(git -C "$tmp/work" rev-parse topic)" --slurpfile r "$tmp/rollup.json" '{state: \$s, headRefOid: \$h, headRefName: "topic", baseRefName: "main", mergeStateStatus: \$m, mergeable: "MERGEABLE", labels: [], statusCheckRollup: \$r[0]} + input' "$tmp/extra.json" ;;
  api*/protection*) [ -f "$tmp/required" ] && cat "$tmp/required" || exit 1 ;;
  *) exit 1 ;;
esac
F
}
qrun() { rm -f "$tmp/looked"; ( cd "$tmp/work" && HITL_WAIT_SNAPSHOT=0 PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --poll 0 "$@" --test "${QTEST:-true}" >"$tmp/out" 2>&1 ); rc=$?; }
echo '{}' >"$tmp/extra.json"
rm -f "$tmp/merged-after"
behind_gh ''; qrun --timeout 0
[ $rc -eq 124 ] && grep -q 'behind main, not ready yet' "$tmp/out" && ! grep -q 'merged origin/main' "$tmp/out" && [ ! -e "$tmp/queue/9" ] \
  || fail "a behind PR that is not ready waits and does not queue: $rc $(cat "$tmp/out")"
echo 'ready_since=1 pr=8' >"$tmp/queue/8"
behind_gh SUCCESS; qrun --timeout 0
[ $rc -eq 124 ] && grep -q 'behind main, queued behind #8' "$tmp/out" && ! grep -q 'merged origin/main' "$tmp/out" && [ -f "$tmp/queue/9" ] \
  || fail "a ready PR behind an earlier one waits for it, and its place survives a timeout: $rc $(cat "$tmp/out")"
touch -d '1 hour ago' "$tmp/queue/8"; : >"$tmp/merged-after"
qrun --timeout 1
[ $rc -eq 0 ] && grep -q 'merged origin/main' "$tmp/out" && grep -q 'pushed' "$tmp/out" && [ ! -e "$tmp/queue/9" ] \
  || fail "an earlier entry whose watcher is gone does not hold the line, and a merge frees the place: $rc $(cat "$tmp/out")"
rm -f "$tmp/queue/"* "$tmp/merged-after"; echo 'ready_since=9999999999 pr=10' >"$tmp/queue/10"
behind_gh SUCCESS; : >"$tmp/merged-after"; qrun --timeout 1
[ $rc -eq 0 ] && grep -q 'merged origin/main' "$tmp/out" && [ -f "$tmp/queue/10" ] \
  || fail "a PR ahead of a later one merges main first: $rc $(cat "$tmp/out")"
rm -f "$tmp/queue/"* "$tmp/merged-after"; echo 'ready_since=1 pr=9' >"$tmp/queue/9"
behind_gh FAILURE; qrun --timeout 0
[ $rc -eq 2 ] && [ ! -e "$tmp/queue/9" ] || fail "changes requested drops the place: $rc $(cat "$tmp/out")"
# An entry whose PR is not ready holds the line only for HITL_QUEUE_PENDING seconds.
rm -f "$tmp/queue/"* "$tmp/merged-after"; echo "ready_since=1 pr=8 state=pending since=$(( $(date +%s) - 60 ))" >"$tmp/queue/8"
behind_gh SUCCESS; qrun --timeout 0
[ $rc -eq 124 ] && grep -q 'queued behind #8' "$tmp/out" || fail "an entry pending for a minute still holds the line: $rc $(cat "$tmp/out")"
echo "ready_since=1 pr=8 state=pending since=$(( $(date +%s) - 3000 ))" >"$tmp/queue/8"; rm -f "$tmp/queue/9"; : >"$tmp/merged-after"
behind_gh SUCCESS; qrun --timeout 1
[ $rc -eq 0 ] && grep -q 'merged origin/main' "$tmp/out" || fail "an entry pending past the bound does not hold the line: $rc $(cat "$tmp/out")"
# A PR held on purpose (draft, awaiting-user, auto-merge off) leaves the queue; one that ends in an error does too.
rm -f "$tmp/queue/"* "$tmp/merged-after"
for extra in '{"isDraft": true}' '{"labels": [{"name": "awaiting-user"}]}' '{"autoMergeRequest": null}'; do
  echo 'ready_since=1 pr=9 state=ready since=1' >"$tmp/queue/9"; echo "$extra" >"$tmp/extra.json"
  behind_gh SUCCESS; qrun --timeout 0
  [ $rc -eq 124 ] && [ ! -e "$tmp/queue/9" ] && grep -q 'not ready yet' "$tmp/out" || fail "a PR with $extra leaves the queue and waits: $rc $(cat "$tmp/out")"
done
echo '{}' >"$tmp/extra.json"
# review and local-ci passed but a required GitHub check has not reported: the PR joins as pending, so it
# cannot hold the line for ever; with that check green it is ready.
rm -f "$tmp/queue/"*; echo 'ready_since=1 pr=8' >"$tmp/queue/8"; echo '{"required_status_checks": {"contexts": ["local-ci", "test", "review"]}}' >"$tmp/required"
behind_gh SUCCESS; qrun --timeout 0
[ $rc -eq 124 ] && grep -q 'state=pending' "$tmp/queue/9" || fail "a PR with a required check not yet reported is pending: $rc $(cat "$tmp/queue/9" 2>/dev/null) $(cat "$tmp/out")"
rm -f "$tmp/required" "$tmp/queue/9"
behind_gh SUCCESS; qrun --timeout 0
grep -q 'state=ready' "$tmp/queue/9" || fail "with nothing waiting or running the PR is ready: $(cat "$tmp/queue/9" 2>/dev/null)"
rm -f "$tmp/queue/"*; behind_gh SUCCESS; QTEST=false qrun --timeout 1
[ $rc -eq 5 ] && [ ! -e "$tmp/queue/9" ] || fail "failing tests after merging main free the place: $rc $(cat "$tmp/out")"
rm -f "$tmp/queue/"*; echo 'ready_since=1 pr=8' >"$tmp/queue/8"
behind_gh SUCCESS; ( cd "$tmp/work" && HITL_WAIT_SNAPSHOT=0 PATH="$tmp/bin:$PATH" bash "$HERE/wait-for.sh" 9 --no-update --poll 0 --timeout 0 >"$tmp/out" 2>&1 ); rc=$?
[ $rc -eq 3 ] && [ ! -e "$tmp/queue/9" ] || fail "--no-update reports a behind PR and never queues: $rc $(cat "$tmp/out")"

[ $fails -eq 0 ] && echo "wait-for: all cases pass"
exit $fails
