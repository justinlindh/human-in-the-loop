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
    jq -n --arg s "\$s" --arg m "\$m" --arg h "\$(git -C "$tmp/work" rev-parse topic)" '{state: \$s, headRefOid: \$h, headRefName: "topic", baseRefName: "main", mergeStateStatus: \$m, mergeable: "MERGEABLE", statusCheckRollup: [], labels: []}' ;;
  api*/protection*) exit 1 ;;
  *) exit 1 ;;
esac
F
up() { # <test command>: run wait-for in the scratch worktree, the PR behind main
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

[ $fails -eq 0 ] && echo "wait-for: all cases pass"
exit $fails
