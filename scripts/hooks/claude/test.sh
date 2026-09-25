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
  local h="$1"; case "$h" in /*) ;; *) h="$HERE/$h" ;; esac
  out="$(printf '%s' "$2" | bash "$h" 2>"$tmp/err")"; rc=$?
  t1=$(date +%s%N); ms=$(( (t1 - t0) / 1000000 )); err="$(cat "$tmp/err")"
  [ "$ms" -lt 200 ] || { echo "SLOW $1: ${ms}ms"; slow=$((slow + 1)); }
}
bashjson() { jq -n --arg c "$1" --arg d "${2:-$tmp}" '{hook_event_name: "PreToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c}}'; }
denied() { run bash-guard.sh "$(bashjson "$1" "${2:-}")"; [ $rc -eq 2 ] || fail "bash-guard should deny: $1 (rc $rc)"; }
allowed() { run bash-guard.sh "$(bashjson "$1" "${2:-}")"; [ $rc -eq 0 ] || fail "bash-guard should allow: $1 (rc $rc: $err)"; }

# A repository shaped like this one: the lane map, a main branch and lane branches.
repo="$tmp/repo"; mkdir -p "$repo/scripts/hooks/claude"; cp "$HERE/lanes.txt" "$HERE/lane-guard.sh" "$repo/scripts/hooks/claude/"
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
# git stash: every worktree shares one stack, so only the read-only list and show get through.
for c in 'git stash' 'git stash push -m wip' 'git stash save wip' 'git stash pop' 'git stash apply stash@{0}' \
  'git stash drop' 'git -C ../gamedev-sim stash' 'cd x && git stash && git checkout main' 'npm test; git stash pop' \
  'GIT_DIR=.git git stash -u' 'git -c core.x=1 stash push' 'if git stash pop; then echo ok; fi' 'nice -n 10 git stash' \
  'timeout 60 git stash pop' 'time git stash pop' 'sudo git stash' 'git -C "/some dir" stash pop' 'git --no-pager stash pop' \
  $'npm test\ngit stash pop'; do denied "$c"; done
run bash-guard.sh "$(bashjson 'git stash pop')"
[[ "$err" == *"commit to a scratch branch or copy to your scratchpad; all worktrees share one stash stack"* ]] || fail "the stash refusal should say what to do instead (got: $err)"
for c in 'git stash list' 'git stash show -p stash@{0}' 'x=$(git stash list)' 'git stash list | head' 'git stash show' 'git commit -m "no git stash here"' "echo 'never git stash'" \
  'grep -rn stash scripts' 'git log --grep=stash' "cat > \$R <<'EOF'
Two lanes ran git stash pop within seconds.
EOF
bash scripts/review-verdict.sh 5 pass \$R"; do allowed "$c"; done
allowed 'ps -o pid= -p 1'
allowed 'git push -u origin integ/x'
allowed 'B=/tmp/body.md; gh pr create --title t --body-file $B'
printf 'Clean body with a repo path scripts/ci-pr.sh\n' >"$tmp/clean.md"
allowed "gh pr create --title t --body-file $tmp/clean.md"
allowed 'npm test'
denied 'gh api repos/o/r/issues/5/comments -f body="log at /tmp/run.log"'
printf 'see /home/justin/x.png\n' >"$tmp/api.md"
denied "gh api repos/o/r/pulls/5/reviews -F body=@$tmp/api.md -f event=COMMENT"
denied "gh api -X POST repos/o/r/issues/5/comments --input $tmp/api.md"
allowed 'gh api repos/o/r/issues/5/comments -f body="all green"'
printf 'All green: scripts/ci-pr.sh passes.\n' >"$tmp/apiclean.md"
allowed "gh api repos/o/r/pulls/5/reviews -F body=@$tmp/apiclean.md -f event=COMMENT"
allowed "gh api repos/o/r/issues/5/comments --field body=@$tmp/apiclean.md"
allowed 'gh api repos/o/r/pulls/5 --jq .state'
# A body built from a file is judged by the file's contents, wherever the file lives.
allowed "gh pr create --title t --body \"\$(cat $tmp/clean.md)\""
allowed "gh pr create --title t --body \"\$(<$tmp/clean.md)\""
allowed "gh pr comment 5 --body \"\`cat $tmp/clean.md\`\""
allowed "gh pr edit 5 --body-file $tmp/clean.md"
allowed "gh pr comment 5 --body-file $tmp/clean.md"
denied "gh pr create --title t --body \"\$(cat $tmp/body.md)\""
denied "gh pr edit 5 --body-file $tmp/body.md"
denied "gh pr comment 5 --body-file $tmp/body.md"
leak="$tmp/leak"
denied "gh pr create --title t --body \"intro \$(cat $tmp/clean.md) and $leak\""
# Heredocs are data: a review that talks about gh pr commands and example paths is not PR text for
# a gh call, but a heredoc that becomes the gh command's body still is.
allowed "cat > \$R <<'EOF'
The check refused gh pr create --body \"see $leak\" as intended.
EOF
bash scripts/review-verdict.sh 5 pass \$R"
allowed "python3 - <<'EOF'
open('$leak/x', 'w').write('scratch')
EOF
gh pr create --title t --body-file $tmp/clean.md"
denied "cat > \$B <<'EOF'
Evidence in $leak/shot.png
EOF
gh pr create --title t --body-file \$B"
denied "gh pr create --title t --body-file - <<'EOF'
Evidence in $leak/shot.png
EOF"
denied "tee \$B <<'EOF' >/dev/null
Evidence in $leak/shot.png
EOF
gh pr create --title t --body-file \$B"
denied "tee -a \"\$B\" <<'EOF'
Evidence in $leak/shot.png
EOF
gh pr create --title t --body-file \"\$B\""
allowed "tee \$R <<'EOF'
The check refused gh pr create --body \"see $leak\" as intended.
EOF
bash scripts/review-verdict.sh 5 pass \$R"

# lane-guard: branch prefix decides
editjson() { jq -n --arg f "$1" --arg d "$repo" '{hook_event_name: "PreToolUse", tool_name: "Edit", cwd: $d, tool_input: {file_path: $f}}'; }
lane_ok() { run "$repo/scripts/hooks/claude/lane-guard.sh" "$(editjson "$1")"; [ $rc -eq 0 ] || fail "lane-guard ($2) should allow $1 (rc $rc: $err)"; }
lane_no() { run "$repo/scripts/hooks/claude/lane-guard.sh" "$(editjson "$1")"; [ $rc -eq 2 ] || fail "lane-guard ($2) should deny $1 (rc $rc)"; }
g -C "$repo" checkout -q -b sim/balance
lane_ok "$repo/src/sim/tick.js" sim
lane_ok "$repo/tests/sim/a.test.js" sim
lane_ok "$repo/docs/toolkit.md" sim
lane_ok "$repo/.claude/agents/sim-engineer.md" sim
lane_no "$repo/src/ui/hud.js" sim
[[ "$err" == *"belongs to ui"* ]] || fail "lane-guard should name the owner (got: $err)"
lane_no "$repo/scripts/ci-pr.sh" sim
lane_ok "$tmp/elsewhere/notes.md" sim
other="$tmp/other"; g init -q -b sim/x "$other"; mkdir -p "$other/src/ui"
lane_ok "$other/src/ui/x.js" "a checkout of another repository"
echo "src/ui/hud.js" >>"$(git -C "$repo" rev-parse --absolute-git-dir)/hitl-lane-allow"
lane_ok "$repo/src/ui/hud.js" "sim with an agreed exception"
g -C "$repo" checkout -q main
lane_ok "$repo/CLAUDE.md" main
lane_ok "$repo/src/contract/contract.md" main
lane_no "$repo/src/sim/tick.js" main
g -C "$repo" checkout -q sim/balance
lane_no "$repo/docs/superpowers/plans/plan.md" "sim, the plan"
g -C "$repo" checkout -q -b integ/hooks
lane_ok "$repo/.claude/settings.json" integ
lane_ok "$repo/scripts/hooks/claude/bash-guard.sh" integ
lane_ok "$repo/src/pacing.test.js" integ
lane_no "$repo/CLAUDE.md" "integ, CLAUDE.md"
g -C "$repo" checkout -q -b tools/sweep
lane_ok "$repo/docs/toolkit.md" tools
lane_no "$repo/docs/superpowers/specs/spec.md" "tools, the spec"
g -C "$repo" checkout -q -b lead/docs
lane_ok "$repo/CLAUDE.md" lead
lane_ok "$repo/docs/superpowers/plans/plan.md" lead
lane_no "$repo/.claude/settings.json" "lead, the hook settings"
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
for w in 'turning it on' 'Affects section is missing or empty' 'Gates run' 'Fixes #n'; do [[ "$out" == *"$w"* ]] || fail "pr-create-check should mention: $w (got: $out)"; done
sleep 0.3; grep -q 'pr merge 42 -R o/r --auto --merge' "$tmp/gh.log" || fail "pr-create-check should turn on auto-merge"
: >"$tmp/gh.log"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --draft --body-file $tmp/good.md" "$url")"
sleep 0.3; grep -q 'pr merge' "$tmp/gh.log" && fail "pr-create-check must not turn on auto-merge for a draft"
# Only a real invocation, and only the URL it printed on its own line.
review="tee \$R <<'EOF'
The hook ran after gh pr create and enabled auto-merge on $url by mistake.
EOF
bash scripts/review-verdict.sh 42 pass \$R"
for c in "$review" "echo 'next: gh pr create --fill'" "echo \"run gh pr create\"" "grep -n 'gh pr create' notes.md"; do
  : >"$tmp/gh.log"
  PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "$c" "$url")"
  sleep 0.3; [ -s "$tmp/gh.log" ] && fail "pr-create-check must ignore a mention of gh pr create: $c"
  [ -z "$out" ] || fail "pr-create-check should be silent for a mention: $c (got: $out)"
done
: >"$tmp/gh.log"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --body-file $tmp/good.md" "Posted review on $url (pass)")"
sleep 0.3; [ -s "$tmp/gh.log" ] && fail "pr-create-check must not act on a URL inside other output"
: >"$tmp/gh.log"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "cd x && GH_DEBUG= gh pr create --title \"a b\" --body-file $tmp/good.md" "Creating pull request for o:x into main in o/r

$url")"
sleep 0.3; grep -q 'pr merge 42 -R o/r --auto --merge' "$tmp/gh.log" || fail "pr-create-check should act on a real create after && and VAR="
printf '## Evidence\n\n- **Tests:** fine\n- **Gates run:**\n  - `npm run test:fast`: "Tests 7 passed (7)".\n  - `clip.mjs`: 51 of 51.\n\n## Affects\n\nNone\n\n## Closes\n\nRefs #406\n' >"$tmp/nested.md"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --body-file $tmp/nested.md && gh pr merge 42 --auto --merge" "$url")"
[ -z "$out" ] || fail "pr-create-check should accept nested Gates run bullets and Refs #n (got: $out)"
printf '## Evidence\n- **Gates run:**\n\n## Affects\nNone\n\nFixes #1\n' >"$tmp/emptygates.md"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "gh pr create --body-file $tmp/emptygates.md && gh pr merge 42 --auto --merge" "$url")"
[[ "$out" == *"Gates run"* ]] || fail "pr-create-check should flag an empty Gates run entry (got: $out)"
PATH="$tmp/bin:$PATH" run pr-create-check.sh "$(prjson "npm test" "ok")"; [ -z "$out" ] || fail "pr-create-check should ignore other commands"

# Every hook fails open on nonsense input.
for h in bash-guard.sh lane-guard.sh behind-main.sh pr-create-check.sh; do
  run "$h" 'not json'; [ $rc -ne 2 ] || fail "$h should fail open on bad input"
done

[ $slow -eq 0 ] || echo "($slow slow runs)"
[ $fails -eq 0 ] && echo "claude hooks: all cases pass" || echo "claude hooks: $fails failing"
[ $fails -eq 0 ]
