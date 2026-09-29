#!/usr/bin/env bash
# The author gate of scripts/ci-pr.sh: a person in ci-trusted or an app in ci-trusted-bots passes, and
# forks and everyone else are refused before anything is run. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'SH'
#!/usr/bin/env bash
jqarg() { while [ $# -gt 0 ]; do [ "$1" = --jq ] && { echo "$2"; return; }; shift; done; }
case "$1 $2" in
  "pr view") case "$*" in *isCrossRepository*) jq -r "$(jqarg "$@")" <<<"$PR_JSON" ;; *) : ;; esac ;;
  "repo view") echo justinlindh ;;
  "api repos/{owner}/{repo}/pulls/9") jq -r "$(jqarg "$@")" <<<"$REST_JSON" ;;
  *) : ;;
esac
SH
chmod +x "$tmp/bin/gh"
printf '# people\njustinlindh\n' >"$tmp/trusted"
printf '# apps\nloop-reviewer-justinlindh[bot]\n' >"$tmp/bots"
run() { # <gh author login> <cross> <REST login> <REST type> [head owner]: sets rc and out
  PR_JSON="$(jq -n --arg a "$1" --argjson c "$2" --arg o "${5:-justinlindh}" '{isCrossRepository: $c, headRepositoryOwner: {login: $o}, author: {login: $a}, headRefName: "x/y", baseRefName: "main"}')"
  REST_JSON="$(jq -n --arg l "$3" --arg t "$4" '{user: {login: $l, type: $t}}')"
  out="$(PR_JSON="$PR_JSON" REST_JSON="$REST_JSON" PATH="$tmp/bin:$PATH" CI_PR_UPDATED=1 CI_WORKTREE_ROOT="$tmp/root" CI_TRUSTED_FILE="$tmp/trusted" CI_TRUSTED_BOTS_FILE="$tmp/bots" \
    timeout 60 bash "$HERE/ci-pr.sh" 9 --no-comment 2>&1)"; rc=$?
}
passes() { [[ "$out" == *"process group"* ]]; }
refused() { [ $rc -eq 2 ] && [[ "$out" == *"not running it"* ]]; }
run justinlindh false justinlindh User; passes || fail "the owner passes ($rc: $out)"
run stranger false stranger User; refused || fail "an outside author is refused ($rc: $out)"
run 'app/loop-reviewer-justinlindh' false 'loop-reviewer-justinlindh[bot]' Bot; passes || fail "a listed app passes ($rc: $out)"
run 'app/other-app' false 'other-app[bot]' Bot; refused || fail "an unlisted app is refused ($rc: $out)"
run 'app/loop-reviewer-justinlindh' false 'loop-reviewer-justinlindh' User; refused || fail "a person with a listed app's name is refused ($rc: $out)"
run 'app/loop-reviewer-justinlindh' true 'loop-reviewer-justinlindh[bot]' Bot other; refused || fail "a listed app's fork PR is refused ($rc: $out)"
run 'loop-reviewer-justinlindh[bot]' false 'loop-reviewer-justinlindh[bot]' Bot; refused || fail "the bot form of the login in gh's author field is refused ($rc: $out)"
[ $fails -eq 0 ] && echo "ci-pr-trust: all cases pass" || echo "ci-pr-trust: $fails failing"
[ $fails -eq 0 ]
