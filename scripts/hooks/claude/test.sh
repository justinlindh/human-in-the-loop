#!/usr/bin/env bash
# Cases for the Claude Code hooks in this directory, fed the JSON Claude Code sends. Each case also
# checks the hook ran in under 200 ms (network-free paths). Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; slow=0
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
# run <hook> <json>: sets rc, out, err, ms
run() {
  local t0 t1; t0=$(date +%s%N)
  out="$(printf '%s' "$2" | bash "$HERE/$1" 2>"$tmp/err")"; rc=$?
  t1=$(date +%s%N); ms=$(( (t1 - t0) / 1000000 )); err="$(cat "$tmp/err")"
  [ "$ms" -lt 200 ] || { echo "SLOW $1: ${ms}ms"; slow=$((slow + 1)); }
}
bashjson() { jq -n --arg c "$1" --arg d "${2:-$tmp}" '{hook_event_name: "PreToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c}}'; }
denied() { run bash-guard.sh "$(bashjson "$1" "${2:-}")"; [ $rc -eq 2 ] || fail "bash-guard should deny: $1 (rc $rc)"; }
allowed() { run bash-guard.sh "$(bashjson "$1" "${2:-}")"; [ $rc -eq 0 ] || fail "bash-guard should allow: $1 (rc $rc: $err)"; }

# A repository shaped like this one: the lane map, a main branch and lane branches.
repo="$tmp/repo"; mkdir -p "$repo/scripts/hooks/claude"; cp "$HERE/lanes.txt" "$repo/scripts/hooks/claude/"
g -C "$repo" init -q -b main && g -C "$repo" add -A && g -C "$repo" commit -qm base

# bash-guard
denied 'pkill -f vite'
denied 'pgrep -fa "node scripts"'
denied 'sleep 1; pgrep --full ci-pr'
denied 'git push origin main'
denied 'git push -f origin integ/x'
denied 'git push --force-with-lease origin integ/x'
denied 'git push origin +integ/x'
denied 'git push origin HEAD:main'
denied 'git -C /somewhere push origin main'
denied 'gh pr create --title t --body "logs in /home/justin/x"'
denied "gh pr comment 5 --body-file - <<'EOF'
see /tmp/out.log
EOF"
printf 'Evidence at /home/justin/shots/a.png\n' >"$tmp/body.md"
denied "gh pr create --title t --body-file $tmp/body.md"
g -C "$repo" checkout -q -b integ/x
allowed 'git push' "$repo"
g -C "$repo" checkout -q main
denied 'git push' "$repo"
allowed 'kill 1234'
allowed 'pgrep -x node'
allowed 'ps -o pid= -p 1'
allowed 'git push -u origin integ/x'
allowed 'B=/tmp/body.md; gh pr create --title t --body-file $B'
printf 'Clean body with a repo path scripts/ci-pr.sh\n' >"$tmp/clean.md"
allowed "gh pr create --title t --body-file $tmp/clean.md"
allowed 'npm test'

# lane-guard: branch prefix decides
editjson() { jq -n --arg f "$1" --arg d "$repo" '{hook_event_name: "PreToolUse", tool_name: "Edit", cwd: $d, tool_input: {file_path: $f}}'; }
lane_ok() { run lane-guard.sh "$(editjson "$1")"; [ $rc -eq 0 ] || fail "lane-guard ($2) should allow $1 (rc $rc: $err)"; }
lane_no() { run lane-guard.sh "$(editjson "$1")"; [ $rc -eq 2 ] || fail "lane-guard ($2) should deny $1 (rc $rc)"; }
g -C "$repo" checkout -q -b sim/balance
lane_ok "$repo/src/sim/tick.js" sim
lane_ok "$repo/tests/sim/a.test.js" sim
lane_ok "$repo/docs/toolkit.md" sim
lane_ok "$repo/.claude/agents/sim-engineer.md" sim
lane_no "$repo/src/ui/hud.js" sim
[[ "$err" == *"belongs to ui"* ]] || fail "lane-guard should name the owner (got: $err)"
lane_no "$repo/scripts/ci-pr.sh" sim
lane_ok "$tmp/elsewhere/notes.md" sim
echo "src/ui/hud.js" >>"$(git -C "$repo" rev-parse --absolute-git-dir)/hitl-lane-allow"
lane_ok "$repo/src/ui/hud.js" "sim with an agreed exception"
g -C "$repo" checkout -q main
lane_ok "$repo/CLAUDE.md" main
lane_ok "$repo/src/contract/contract.md" main
lane_no "$repo/src/sim/tick.js" main
g -C "$repo" checkout -q -b newlane/thing
lane_ok "$repo/src/sim/tick.js" "an unlisted prefix"
g -C "$repo" checkout -q --detach
lane_ok "$repo/src/sim/tick.js" detached
g -C "$repo" checkout -q main

# behind-main: silent when current; a notice with tooling commits when behind; repeats only on change
origin="$tmp/origin.git"; g init -q --bare -b main "$origin"; g -C "$repo" remote add origin "$origin"; g -C "$repo" push -q origin main
clone="$tmp/clone"; g clone -q "$origin" "$clone" 2>/dev/null
ev() { jq -n --arg e "$1" --arg d "$clone" '{hook_event_name: $e, cwd: $d}'; }
run behind-main.sh "$(ev SessionStart)"; [ -z "$out" ] || fail "behind-main should be silent when up to date (got: $out)"
mkdir -p "$repo/scripts" && echo x >"$repo/scripts/tool.sh" && g -C "$repo" add -A && g -C "$repo" commit -qm "feat(integ): a new tool"
echo y >"$repo/README.md" && g -C "$repo" add -A && g -C "$repo" commit -qm "docs: readme"
g -C "$repo" push -q origin main && g -C "$clone" fetch -q origin
run behind-main.sh "$(ev SessionStart)"
[[ "$out" == *"2 commit(s) behind origin/main"* && "$out" == *"a new tool"* && "$out" != *"readme"* ]] || fail "behind-main notice (got: $out)"
jq -e '.hookSpecificOutput.additionalContext' <<<"$out" >/dev/null 2>&1 || fail "behind-main should print additionalContext JSON"
run behind-main.sh "$(ev UserPromptSubmit)"; [ -z "$out" ] || fail "behind-main should not repeat an unchanged notice (got: $out)"
echo z >"$repo/LICENSE" && g -C "$repo" add -A && g -C "$repo" commit -qm "chore: license" && g -C "$repo" push -q origin main && g -C "$clone" fetch -q origin
run behind-main.sh "$(ev UserPromptSubmit)"; [[ "$out" == *"3 commit(s) behind"* ]] || fail "behind-main should repeat when the count changes (got: $out)"

# pr-create-check: stand-in gh; the body comes from the body file
mkdir -p "$tmp/bin"; printf '#!/usr/bin/env bash\necho "gh $*" >>"%s/gh.log"\n' "$tmp" >"$tmp/bin/gh"; chmod +x "$tmp/bin/gh"
prjson() { jq -n --arg c "$1" --arg o "$2" --arg d "$tmp" '{hook_event_name: "PostToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c}, tool_response: {stdout: $o}}'; }
url='https://github.com/o/r/pull/42'
printf '## What\nx\n\n## Evidence\n- **Gates run:** npm run ci, PASS\n\n## Affects\n- ui: new step\n\n## Closes\n\nFixes #7\n' >"$tmp/good.md"
printf '## What\nx\n\n## Evidence\n- **Gates run:** <!-- fill -->\n\n## Affects\n\n<!-- who -->\n-\n\n## Closes\n' >"$tmp/bad.md"
: >"$tmp/gh.log"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --body-file $tmp/good.md && gh pr merge 42 --auto --merge" "$url")"
[ -z "$out" ] || fail "pr-create-check should be quiet on a complete PR with auto-merge (got: $out)"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --body-file $tmp/bad.md" "$url")"
for w in 'turning it on' 'Affects section is empty' 'Gates run' 'Fixes #n'; do [[ "$out" == *"$w"* ]] || fail "pr-create-check should mention: $w (got: $out)"; done
sleep 0.3; grep -q 'pr merge 42 -R o/r --auto --merge' "$tmp/gh.log" || fail "pr-create-check should turn on auto-merge"
: >"$tmp/gh.log"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --draft --body-file $tmp/good.md" "$url")"
sleep 0.3; grep -q 'pr merge' "$tmp/gh.log" && fail "pr-create-check must not turn on auto-merge for a draft"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "npm test" "ok")"; [ -z "$out" ] || fail "pr-create-check should ignore other commands"

# Every hook fails open on nonsense input.
for h in bash-guard.sh lane-guard.sh behind-main.sh pr-create-check.sh; do
  run "$h" 'not json'; [ $rc -ne 2 ] || fail "$h should fail open on bad input"
done

[ $slow -eq 0 ] || echo "($slow slow runs)"
[ $fails -eq 0 ] && echo "claude hooks: all cases pass" || echo "claude hooks: $fails failing"
[ $fails -eq 0 ]
