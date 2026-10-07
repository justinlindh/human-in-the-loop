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
# In-place edits and redirects of tracked files are refused; scratch and untracked targets are not.
T=scripts/hooks/claude/lanes.txt
denied "sed -i 's/a/b/' $T" "$repo"
denied "sed -i.bak -e 's/a/b/' $T" "$repo"
denied "sed -Ei 's/a|b/c/' \"$T\"" "$repo"
denied "sed --in-place s/a/b/ $T" "$repo"
denied "cd sub && sed -i 's/a/b/' $repo/$T" "$repo"
denied "perl -pi -e 's/a/b/' $T" "$repo"
denied "perl -i.bak -pe 's/a/b/' $T" "$repo"
denied "echo x > $T" "$repo"
denied "echo x >> $T" "$repo"
denied "echo x >| $T" "$repo"
denied "echo x &> $T" "$repo"
denied "cat > \"$T\" <<'EOF'
x
EOF" "$repo"
denied "echo x | tee $T" "$repo"
denied "echo x | tee -a $T" "$repo"
denied "make 2>&1 | sed -i 's/a/b/' $T" "$repo"
# python and node scripts that write a tracked file by a literal path (directly or through a variable).
denied "python3 -c \"open('$T','w').write('x')\"" "$repo"
denied "python -c 'open(\"$T\", \"a\").write(\"x\")'" "$repo"
denied "python3 - <<'PY'
p='$T'
s=open(p).read()
open(p,'w').write(s)
PY" "$repo"
denied "python3 <<EOF
from pathlib import Path
Path('$T').write_text('x')
EOF" "$repo"
denied "python3 -c \"import pathlib; p = pathlib.Path('$T'); p.write_text('x')\"" "$repo"
denied "node -e \"require('fs').writeFileSync('$T','x')\"" "$repo"
denied "node -e \"const f='$T'; require('fs').appendFileSync(f,'x')\"" "$repo"
denied "cd sub && node --input-type=module - <<'JS'
import { writeFileSync } from 'node:fs';
writeFileSync('$T', 'x');
JS" "$repo"
run bash-guard.sh "$(bashjson "python3 -c \"open('$T','w')\"" "$repo")"
[[ "$err" == *"Edit or Write"* ]] || fail "the script-write refusal should point at Edit and Write (got: $err)"
# Reads, scratch targets, run-time paths, script files and quoted mentions get through.
allowed "python3 -c \"import os; p = os.path.join('scripts', 'new-untracked.md'); open(p,'w').write('x')\"" "$repo"
allowed "node -e \"const out = path.join('scripts', 'gen.txt'); require('fs').writeFileSync(out,'x')\"" "$repo"
allowed "python3 -c \"open('scripts','w')\"" "$repo"
allowed "python3 - <<'PY'
f = open('$T')
d = f.read()
f = '/tmp/o.json'
open(f,'w').write(d)
PY" "$repo"
allowed "python3 -c \"print(open('$T').read())\"" "$repo"
allowed "python3 -c \"open('/tmp/out.txt','w').write('x')\"" "$repo"
allowed "python3 -c \"open('\$HOME/.cache/hitl-ci/tmp/x.txt','w').write('x')\"" "$repo"
allowed "python3 -c \"open('notes-untracked.txt','w').write('x')\"" "$repo"
allowed "python3 - <<'PY'
import json
d = json.load(open('$T'))
open('/tmp/scratch/out.json','w').write(json.dumps(d))
PY" "$repo"
allowed "python3 -c \"import sys; open(sys.argv[1],'w').write('x')\" out.txt" "$repo"
allowed "python3 scripts/tools/thing.py $T" "$repo"
allowed "node -e \"console.log(require('fs').readFileSync('$T','utf8').length)\"" "$repo"
allowed "node -e \"require('fs').writeFileSync('/tmp/o.txt','x')\"" "$repo"
allowed "cat $T | python3 -c 'import sys; print(sys.stdin.read())'" "$repo"
allowed "jq -r .name package.json | python3 -c 'import sys; print(sys.stdin.read())'" "$repo"
allowed "git commit -m \"python3 -c open('$T','w') is refused\"" "$repo"
allowed "printf '%s\n' x > ~/.cache/hitl-ci/tmp/pr.txt" "$repo"
allowed "gh pr edit 12 --body-file ~/.cache/hitl-ci/tmp/pr.txt" "$repo"
allowed "python3 -c \"import json; print(json.load(open('/tmp/x.json')))\" | tee /tmp/y.txt" "$repo"
allowed "sed -i 's/a/b/' /tmp/scratch.txt" "$repo"
allowed "sed -i 's/a/b/' notes-untracked.txt" "$repo"
allowed "sed -n 1p $T" "$repo"
allowed "sed 's/a/b/' $T > /tmp/out.txt" "$repo"
allowed "sed 's/a/b/' $T > \"$tmp/out.txt\"" "$repo"
allowed "echo x > scratch-untracked.txt" "$repo"
allowed "echo x >> \$TMPDIR/log.txt" "$repo"
allowed "echo x | tee /tmp/log.txt" "$repo"
allowed "cat $T | grep a > /dev/null 2>&1" "$repo"
allowed "npm run build 2>&1 | tail -5" "$repo"
allowed "perl -MList::Util -e 'print 1' > /dev/null" "$repo"
allowed "git commit -m \"fix: replace sed -i on $T\"" "$repo"
allowed "echo 'a > $T'" "$repo"
allowed "gh issue comment 5 --body \"first line
git show main:$T > $T
last line\"" "$repo"
allowed "gh issue comment 5 --body 'first line
sed -i s/a/b/ $T
last'" "$repo"
allowed "gh issue comment 5 --body \"say \\\"hi\\\" then > $T\"" "$repo"
denied "echo \"ok\" > $T" "$repo"
run bash-guard.sh "$(bashjson "git show main:$T > $T" "$repo")"
[[ "$err" == *"git checkout <ref> -- <file>"* ]] || fail "the tracked-file refusal should point at git checkout (got: $err)"
allowed "cat > /tmp/body.md <<'EOF'
go > $T
EOF" "$repo"
allowed "sed -i 's/a/b/' $T" "$tmp/elsewhere"
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
# ci-pr.sh by hand: auto CI is the one path; reading the script, the reviewer's --allow-bot runs and HITL_MANUAL_CI=1 pass.
for c in 'scripts/ci-pr.sh 766' 'bash scripts/ci-pr.sh 766 --head abc' 'cd x && timeout 3000 bash scripts/ci-pr.sh 12 2>&1 | tail' \
  'nice -n 10 ./scripts/ci-pr.sh 9'; do denied "$c"; done
for c in 'cat scripts/ci-pr.sh' 'bash -n scripts/ci-pr.sh' 'grep -n trap scripts/ci-pr.sh 2>&1' 'sed -n 1,20p scripts/ci-pr.sh' \
  'scripts/ci-pr.sh 781 --allow-bot --head abc' 'HITL_MANUAL_CI=1 bash scripts/ci-pr.sh 766' $'cat <<EOF\nrun scripts/ci-pr.sh 5\nEOF'; do allowed "$c"; done
run bash-guard.sh "$(bashjson 'bash scripts/ci-pr.sh 766')"
[[ "$err" == *"ci-rerun label"* ]] || fail "the ci-pr refusal should say what to do instead (got: $err)"

# review-verdict.sh: only the reviewer (detached) and team-lead (main, lead/) post verdicts.
g -C "$repo" checkout -q main
allowed 'scripts/review-verdict.sh 5 pass body.md' "$repo"
g -C "$repo" checkout -q -b lead/x; allowed 'bash scripts/review-verdict.sh 5 pass body.md' "$repo"
g -C "$repo" checkout -q --detach; allowed 'bash scripts/review-verdict.sh 5 pass body.md' "$repo"
g -C "$repo" checkout -q -b perf/x
denied 'scripts/review-verdict.sh 5 pass body.md' "$repo"
denied 'cd x && nice bash scripts/review-verdict.sh 5 changes body.md --head abc' "$repo"
allowed 'cat scripts/review-verdict.sh' "$repo"
allowed "git commit -m 'review-verdict.sh 5 pass'" "$repo"
g -C "$repo" checkout -q main

# A commit from a disposable review checkout (a detached worktree named review-*) is refused; the same
# commit from a lane worktree, a differently named detached one, and text that only mentions it pass.
rv="$tmp/review-77"; g -C "$repo" worktree add -q --detach "$rv"
denied 'git commit -m probe' "$rv"
denied 'git commit -am probe && echo done' "$rv"
denied "git -C $rv commit -m probe" "$repo"
denied 'nice git -c user.name=x commit -m probe' "$rv"
allowed 'git status' "$rv"
allowed "echo 'git commit -m probe'" "$rv"
allowed $'cat <<EOF\ngit commit -m x\nEOF' "$rv"
allowed 'git commit -m work' "$repo"
other="$tmp/scratch-77"; g -C "$repo" worktree add -q --detach "$other"; allowed 'git commit -m probe' "$other"
g -C "$repo" worktree add -q -b review-branch "$tmp/review-78"; allowed 'git commit -m probe' "$tmp/review-78"

# A scripted sweep edits a constant from the shell: allowed in a detached review-* checkout, refused in a
# lane worktree, in a detached checkout with another name, and in a branch checkout that happens to be named review-*.
allowed "sed -i 's/a/b/' $T" "$rv"
allowed "echo x >> $T" "$rv"
allowed "python3 -c \"open('$T','w').write('x')\"" "$rv"
denied "sed -i 's/a/b/' $T" "$repo"
denied "sed -i 's/a/b/' $T" "$other"
denied "sed -i 's/a/b/' $T" "$tmp/review-78"
# The exemption follows where the write lands, not where the session sits.
denied "cd $repo && sed -i 's/a/b/' $T" "$rv"
denied "sed -i 's/a/b/' $repo/$T" "$rv"
denied "sed -i 's/a/b/' ../repo/$T" "$rv"
denied "git -C $repo status; sed -i 's/a/b/' $T" "$rv"
allowed "sed -i 's/a/b/' $rv/$T" "$rv"

# Sleeping between checks of PR or CI state costs a turn per wait: wait-for.sh in the background instead.
allowed 'sleep 5; gh pr view 12 --json statusCheckRollup'
denied 'until gh pr checks 12; do sleep 30; done'
denied 'while true; do scripts/pr-status.sh | grep 12; sleep 120; done'
denied 'for i in 1 2 3; do gh run list --limit 1; sleep 45; done'
denied 'for n in 1 2; do sleep 30 && gh api repos/o/r/commits/abc/statuses; done'
allowed "git commit -m 'while it waits\nsleep 60 then gh pr view'"
allowed 'for i in 1 2 3; do grep -q exit f.log && break; sleep 10; done; gh pr view 12'
allowed 'git commit -m "it'"'"'s a loop: for x do sleep 5; gh pr view; done"'
allowed 'gh pr view 12 --json statusCheckRollup'
allowed 'sleep 2; npm test'
allowed "git commit -m 'sleep 60 then gh pr view'"
run bash-guard.sh "$(jq -n --arg c 'until gh pr checks 12; do sleep 30; done' --arg d "$tmp" '{hook_event_name: "PreToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c, run_in_background: true}}')"
[ $rc -eq 0 ] || fail "bash-guard should allow a background poll (rc $rc: $err)"
run bash-guard.sh "$(bashjson 'until gh pr view 12; do sleep 60; done')"
[[ "$err" == *"wait-for.sh"* ]] || fail "the sleep-poll refusal should name wait-for.sh (got: $err)"

# wait-for.sh: run_in_background is the only way to keep it alive; &, nohup and setsid are refused.
for c in 'scripts/wait-for.sh 12 --merged &' 'scripts/wait-for.sh 12 --merged > w.log 2>&1 &' 'nohup scripts/wait-for.sh 12 --merged' \
  'setsid scripts/wait-for.sh 12 --merged' 'nohup scripts/wait-for.sh 12 --merged > w.log &' \
  'cd ../x && scripts/wait-for.sh 12 --merged &' 'timeout 60 scripts/wait-for.sh 12 --merged & echo $!'; do
  denied "$c"
done
run bash-guard.sh "$(bashjson 'scripts/wait-for.sh 12 --merged &')"
[[ "$err" == *"run_in_background"* ]] || fail "the wait-for refusal should name run_in_background (got: $err)"
for c in 'scripts/wait-for.sh 12 --merged' 'scripts/wait-for.sh 12' 'scripts/wait-for.sh 12 --merged 2>&1' 'cd ../x && scripts/wait-for.sh 12 --merged' \
  'cat scripts/wait-for.sh' 'git add scripts/wait-for.sh && git status' 'sleep 1 & scripts/wait-for.sh 12 --merged' \
  "gh pr comment 12 --body 'run nohup scripts/wait-for.sh 12 &'" "git commit -m 'wait-for.sh --no-update is allowed'" 'scripts/wait-for.sh 12 --merged --no-update' 'scripts/wait-for.sh 12 --update --merged' 'echo hi &'; do
  allowed "$c"
done
run bash-guard.sh "$(jq -n --arg c 'scripts/wait-for.sh 12 --merged' --arg d "$tmp" '{hook_event_name: "PreToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c, run_in_background: true}}')"
[ $rc -eq 0 ] || fail "bash-guard should allow wait-for.sh with run_in_background (rc $rc: $err)"

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
lane_ok "$repo/docs/toolkit/balance.md" sim
lane_ok "$repo/docs/features/nods.md" sim
lane_ok "$repo/docs/features/README.md" ui
lane_ok "$repo/.claude/agents/sim-engineer.md" sim
lane_no "$repo/src/ui/hud.js" sim
[[ "$err" == *"belongs to ui"* ]] || fail "lane-guard should name the owner (got: $err)"
lane_no "$repo/scripts/ci-pr.sh" sim
# The longest matching prefix is named first; every matching owner is listed; no match names no owner.
g -C "$repo" checkout -q -b ui/hud
lane_no "$repo/tests/tools/x.test.js" "ui, a tools test"
[[ "$err" == *"belongs to tools, sim."* ]] || fail "lane-guard should name tools before sim for tests/tools/ (got: $err)"
lane_no "$repo/tests/sim.test.js" "ui, a sim test"
[[ "$err" == *"belongs to sim."* ]] || fail "lane-guard should name only sim for tests/sim.test.js (got: $err)"
lane_no "$repo/docs/superpowers/plans/x.md" "ui, the plan"
[[ "$err" != *"belongs to #"* && "$err" != *", #"* ]] || fail "lane-guard should not name a comment line as an owner (got: $err)"
lane_no "$repo/nowhere/x.md" "ui, no owner"
[[ "$err" != *"belongs to"* ]] || fail "lane-guard should name no owner for an unowned path (got: $err)"
g -C "$repo" checkout -q sim/balance
lane_ok "$repo/tests/tools/x.test.js" "sim, a tools test"
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
lane_ok "$repo/tests/tools/pair.test.js" tools
lane_ok "$repo/scripts/studio/engine.mjs" tools
lane_no "$repo/tests/sim/balance.test.js" "tools, the sim tests"
lane_no "$repo/docs/superpowers/specs/spec.md" "tools, the spec"
g -C "$repo" checkout -q -b video/reel
lane_ok "$repo/scripts/capture-manifest.js" video
lane_ok "$repo/scripts/feature-media/build.sh" video
lane_ok "$repo/scripts/reels/nods.sh" video
lane_ok "$repo/docs/reels.md" video
lane_ok "$repo/docs/toolkit.md" video
lane_no "$repo/scripts/capture.js" "video, the capture engine"
lane_no "$repo/src/render/index.js" "video, render code"
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
# Rule changes: a session on a lane branch sees what changed in CLAUDE.md, its brief, the PR template
# and the toolkit since it started, once.
mkdir -p "$repo/.claude/agents" "$repo/docs/toolkit" "$repo/.github"
printf '# Rules\n- Use timeout.\n' >"$repo/CLAUDE.md"; printf 'You are sim.\n' >"$repo/.claude/agents/sim-engineer.md"
printf 'You are art.\n' >"$repo/.claude/agents/art-director.md"; printf '## What\n' >"$repo/.github/pull_request_template.md"
printf -- '---\ntool: `old`\nsection: run\n---\nAn old tool.\n' >"$repo/docs/toolkit/old.md"
g -C "$repo" add -A && g -C "$repo" commit -qm "docs: rules" && g -C "$repo" push -q origin main
g -C "$clone" fetch -q origin && g -C "$clone" checkout -q -b sim/work origin/main
sev() { jq -n --arg e "$1" --arg d "$clone" --arg s "$2" '{hook_event_name: $e, cwd: $d, session_id: $s}'; }
run behind-main.sh "$(sev SessionStart s1)"; [ -z "$out" ] || fail "a session starting up to date gets no rule notice (got: $out)"
printf -- '- Never pkill -f.\n' >>"$repo/CLAUDE.md"; printf 'Reach for npm run gates.\n' >>"$repo/.claude/agents/sim-engineer.md"
printf 'Art only.\n' >>"$repo/.claude/agents/art-director.md"
printf -- '---\ntool: `npm run gates`\nsection: pr\n---\nQuick gates on a snapshot.\n' >"$repo/docs/toolkit/gates.md"
g -C "$repo" add -A && g -C "$repo" commit -qm "docs: new rules" && g -C "$repo" push -q origin main && g -C "$clone" fetch -q origin
run behind-main.sh "$(sev UserPromptSubmit s1)"
ctx="$(jq -r '.hookSpecificOutput.additionalContext' <<<"$out" 2>/dev/null)"
for w in "Re-read these; they apply now" "CLAUDE.md changed on main: 1 line(s) added:" "+ - Never pkill -f." ".claude/agents/sim-engineer.md changed" "+ Reach for npm run gates." "docs/toolkit/gates.md: \`npm run gates\`: Quick gates on a snapshot."; do
  [[ "$ctx" == *"$w"* ]] || fail "the rule notice should include: $w (got: $ctx)"
done
[[ "$ctx" != *"art-director"* && "$ctx" != *"old.md"* && "$ctx" != *"0 removed"* ]] || fail "the rule notice should skip other lanes' briefs and old pages (got: $ctx)"
g -C "$clone" merge -q origin/main
run behind-main.sh "$(sev UserPromptSubmit s1)"; [ -z "$out" ] || fail "a rule change is shown once (got: $out)"
run behind-main.sh "$(sev SessionStart s2)"; run behind-main.sh "$(sev UserPromptSubmit s2)"; [ -z "$out" ] || fail "a session that started after the change has read it (got: $out)"

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

# context-nudge: the last assistant usage record decides; a teammate past 180k (the lead past 400k), then every 150k more.
tr_="$tmp/transcript.jsonl"; export XDG_RUNTIME_DIR="$tmp/run"
turn() { # <context tokens> [agent name]: appends an assistant record, then a tool result after it
  jq -nc --argjson c "$1" --arg a "${2:-}" '{type: "assistant", message: {id: ("m" + ($c | tostring)), usage: {input_tokens: 5, cache_creation_input_tokens: 1000, cache_read_input_tokens: ($c - 1005)}}} + (if $a == "" then {} else {agentName: $a} end)' >>"$tr_"
  jq -nc '{type: "user", message: {content: [{type: "tool_result", content: "usage is fine"}]}}' >>"$tr_"
}
nudge() { run context-nudge.sh "$(jq -n --arg t "$tr_" --arg s "${1:-s1}" '{hook_event_name: "UserPromptSubmit", session_id: $s, transcript_path: $t, prompt: "x"}')"; }
turn 170000 art; nudge; [ -z "$out" ] || fail "context-nudge below 180k: $out"
turn 190000 art; nudge; grep -q 'at 190k.*task is done.*handoffs/art.md.*Open threads.*handoff ready.*finish it first' <<<"$out" || fail "context-nudge at 190k: $out"
turn 300000 art; nudge; [ -z "$out" ] || fail "context-nudge repeats within 150k: $out"
turn 345000 art; nudge; grep -q 'at 345k' <<<"$out" || fail "context-nudge after 150k more: $out"
turn 100000 art; nudge; [ -z "$out" ] || fail "context-nudge after a compaction: $out"
turn 200000 art; nudge; grep -q 'at 200k' <<<"$out" || fail "context-nudge resets below the threshold: $out"
: >"$tr_"; turn 300000; nudge s4; [ -z "$out" ] || fail "context-nudge for the lead below 400k: $out"
: >"$tr_"; turn 450000; nudge s3; grep -q 'handoffs/team-lead.md' <<<"$out" && ! grep -q 'tell team-lead' <<<"$out" || fail "context-nudge for the lead: $out"
run context-nudge.sh '{"session_id":"s2","transcript_path":"/nonexistent"}'; [ $rc -eq 0 ] && [ -z "$out" ] || fail "context-nudge without a transcript: $rc $out"
unset XDG_RUNTIME_DIR

# A test run piped on can't gate a commit or push.
denied 'npm run test:fast 2>&1 | grep -E Tests && git commit -m x'
denied 'timeout 600 npm run -s test:fast 2>&1 | tail -3; git add a && git commit -qm x'
denied 'npm test | grep -q passed && git push origin tools/x'
denied 'npx vitest run tests/a.test.js 2>&1 | tail -5 && git -C ../w commit -m x'
allowed 'npm run test:fast >/dev/null 2>&1 && git commit -m x'
allowed 'set -o pipefail; npm run test:fast 2>&1 | tail -3 && git commit -m x'
allowed 'npm test 2>&1 | tail -3; echo "rc=${PIPESTATUS[0]}"; test ${PIPESTATUS[0]} -eq 0 && git commit -m x'
allowed 'npm run test:fast 2>&1 | tail -3'
allowed 'git commit -m x && npm test | tail -3'
allowed "git commit -m 'npm test | grep ok'"
allowed 'npm run -s test:fast 2>&1 | grep Tests; git add a && npm run -s test:fast >/dev/null 2>&1 && git commit -qm x'
allowed 'npx vitest run > vitest1.log 2>&1; rc=$?; grep Tests vitest1.log | head -4; if [ $rc -eq 0 ]; then git commit -qm x; fi'
denied 'npx vitest run 2>&1 | grep -E Tests; git add a && git commit -qm x'
denied 'set -e; npm run -s test:fast 2>&1 | tail -4 && git commit -qam x'
allowed 'npx vitest run a 2>&1 | grep x; git merge -q --no-commit b'
run bash-guard.sh "$(bashjson 'npm test | tail && git commit -m x')"
[[ "$err" == *"exit code"* ]] || fail "the test-gate refusal should say to gate on the exit code (got: $err)"

# merge-skim: after a merge of origin/main, the tooling commits it brought in; once per merge.
up="$tmp/up"; mkdir -p "$up/scripts" "$up/src" "$up/docs/toolkit"; echo a >"$up/scripts/a.sh"; echo a >"$up/src/g.js"
g -C "$up" init -q -b main && g -C "$up" add -A && g -C "$up" commit -qm base
g clone -q "$up" "$tmp/w" 2>/dev/null; w="$tmp/w"
post() { jq -n --arg c "$1" --arg d "${2:-$tmp}" '{hook_event_name: "PostToolUse", tool_name: "Bash", cwd: $d, tool_input: {command: $c}, tool_response: {}}'; }
skim() { run merge-skim.sh "$(post "$@")"; ctx="$(jq -r '.hookSpecificOutput.additionalContext // empty' <<<"$out" 2>/dev/null)"; }
echo b >"$up/scripts/a.sh"; echo "tool: x" >"$up/docs/toolkit/newtool.md"; g -C "$up" add -A && g -C "$up" commit -qm 'feat(integ): a new tool'
echo b >"$up/src/g.js"; g -C "$up" commit -qam 'feat(ui): game only'
g -C "$w" fetch -q && g -C "$w" merge -q --no-edit origin/main
skim "cd $w && git fetch -q origin && git merge -q --no-edit origin/main"
grep -q 'brought in 1 tooling' <<<"$ctx" && grep -q 'a new tool' <<<"$ctx" && ! grep -q 'game only' <<<"$ctx" && grep -q 'New toolkit pages: newtool' <<<"$ctx" || fail "merge-skim lists the tooling commits: $out"
skim "cd $w && git merge -q --no-edit origin/main"; [ -z "$out" ] || fail "merge-skim reports a merge once: $out"
echo c >"$up/src/g.js"; g -C "$up" commit -qam 'fix(ui): game only again'; g -C "$w" fetch -q && g -C "$w" merge -q --no-edit origin/main
skim "git -C $w merge origin/main"; [ -z "$out" ] || fail "merge-skim is silent when no tooling came in: $out"
echo c >"$up/scripts/a.sh"; g -C "$up" commit -qam 'fix(integ): tool fix'; g -C "$w" fetch -q && g -C "$w" merge -q --no-edit origin/main
skim "git -C $w status"; [ -z "$out" ] || fail "merge-skim ignores commands that don't merge: $out"
skim "git -C $w merge -q --no-edit origin/main"; grep -q 'tool fix' <<<"$ctx" || fail "merge-skim follows git -C: $out"
skim "cd $w && git log origin/main"; [ -z "$out" ] || fail "merge-skim ignores a log of origin/main: $out"

# Every hook fails open on nonsense input.
for h in bash-guard.sh lane-guard.sh behind-main.sh pr-create-check.sh context-nudge.sh merge-skim.sh; do
  run "$h" 'not json'; [ $rc -ne 2 ] || fail "$h should fail open on bad input"
done

# em-dash-guard: SendMessage text and summary, as the character or its escape text
D=$(printf '\xe2\x80\x94'); E=$(printf '\\u%s' 2014)
msg() { jq -n --arg m "$1" --arg s "${2:-status}" '{hook_event_name: "PreToolUse", tool_name: "SendMessage", tool_input: {to: "ui", message: $m, summary: $s}}'; }
run em-dash-guard.sh "$(msg "PR 12 ${D} merged")"; [ $rc -eq 2 ] && [[ "$err" == *"em dash"* ]] || fail "em-dash-guard should refuse a dash in the message (rc $rc)"
run em-dash-guard.sh "$(msg "PR 12 merged" "done ${D} merged")"; [ $rc -eq 2 ] || fail "em-dash-guard should refuse a dash in the summary (rc $rc)"
run em-dash-guard.sh "$(msg "PR 12 ${E} merged")"; [ $rc -eq 2 ] || fail "em-dash-guard should refuse the escape text (rc $rc)"
run em-dash-guard.sh "$(jq -n --arg r "no ${D} thanks" '{tool_name: "SendMessage", tool_input: {to: "lead", message: {type: "shutdown_response", request_id: "r1", approve: false, reason: $r}}}')"; [ $rc -eq 2 ] || fail "em-dash-guard should check a structured message (rc $rc)"
run em-dash-guard.sh "$(msg "PR 12 merged - see #13, a range 3-4 and a minus -1")"; [ $rc -eq 0 ] || fail "em-dash-guard should allow hyphens (rc $rc: $err)"
run em-dash-guard.sh "$(msg "en dash $(printf '\xe2\x80\x93') is fine")"; [ $rc -eq 0 ] || fail "em-dash-guard should allow an en dash (rc $rc: $err)"
run em-dash-guard.sh 'not json'; [ $rc -eq 0 ] || fail "em-dash-guard should let unreadable input through (rc $rc)"

[ $slow -eq 0 ] || echo "($slow slow runs)"
[ $fails -eq 0 ] && echo "claude hooks: all cases pass" || echo "claude hooks: $fails failing"
[ $fails -eq 0 ]
