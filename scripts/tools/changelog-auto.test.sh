#!/usr/bin/env bash
# Cases for scripts/tools/changelog-auto.sh with scratch game and site origins and stand-in gh and claude.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp" TZ=UTC
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
DAY=2026-10-05

# The game origin: only history (the run's scripts are the ones next to it).
mkdir -p "$tmp/game" && cd "$tmp/game" || exit 1
echo game >README.md
git init -q -b main . && g add -A && g commit -q -m base && git clone -q --bare . "$tmp/game.git"
# The site origin: an entries file and a test that fails on a marker word.
mkdir -p "$tmp/site/changelog" && cd "$tmp/site" || exit 1
cat >package.json <<'EOF'
{"name":"site","version":"1.0.0","scripts":{"test":"node check.js"}}
EOF
cat >check.js <<'EOF'
const t = require('fs').readFileSync('changelog/entries.json', 'utf8');
JSON.parse(t);
if (t.includes('FAILME')) { console.error('the entries hold FAILME'); process.exit(1); }
EOF
echo '[{"date":"2026-10-01","headline":"Old","items":[{"area":"A","title":"T","body":"B","refs":[]}]}]' >changelog/entries.json
git init -q -b main . && g add -A && g commit -q -m base && git clone -q --bare . "$tmp/site.git"
cd "$HERE" || exit 1

mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$CL_GH_CALLS"
case "$*" in
  "pr list --state merged"*) cat "$CL_MERGED" ;;
  "pr list --repo"*) [ -f "$CL_PR_OPEN" ] && echo 41 ;;
  "pr create"*) : >"$CL_PR_OPEN"; echo "https://github.com/x/y/pull/41" ;;
  "issue list"*) [ -f "$CL_ISSUE_OPEN" ] && echo 7 ;;
  "issue create"*) : >"$CL_ISSUE_OPEN" ;;
  "issue close"*) rm -f "$CL_ISSUE_OPEN" ;;
esac
exit 0
EOF
cat >"$tmp/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo "call" >>"$CL_CLAUDE_CALLS"
n="$(wc -l <"$CL_CLAUDE_CALLS")"
case "${CL_STUB_MODE:-ok}" in
  fail) exit 1 ;;
  garbage) echo "I could not do that." ;;
  retry) if [ "$n" -eq 1 ]; then H="Bad $(printf '\xe2\x80\x94') dash"; else H="${CL_STUB_HEADLINE:-Good}"; fi
         printf '{"date":"%s","headline":"%s","items":[{"area":"UI","title":"A thing","body":"It works.","refs":["#9"]}]}' "$CL_DAY" "$H" ;;
  *) printf 'Here is the entry:\n{"date":"%s","headline":"%s","items":[{"area":"UI","title":"A thing","body":"%s","refs":["#9"],"media":[{"src":"https://github.com/justinlindh/human-in-the-loop/blob/feature-media/office-box.webp?raw=true","kind":"image","caption":"Box"}]}]}\n' "$CL_DAY" "${CL_STUB_HEADLINE:-Good}" "${CL_STUB_BODY:-It works.}" ;;
esac
EOF
chmod +x "$tmp/bin/gh" "$tmp/bin/claude"
export PATH="$tmp/bin:$PATH" GH="$tmp/bin/gh" CL_CLAUDE="$tmp/bin/claude" CL_GAME_ORIGIN="$tmp/game.git" CL_SITE_ORIGIN="$tmp/site.git" CL_SITE_REPO=x/site CL_STATE="$tmp/state"
export CL_GH_CALLS="$tmp/ghcalls" CL_CLAUDE_CALLS="$tmp/claudecalls" CL_PR_OPEN="$tmp/pr-open" CL_ISSUE_OPEN="$tmp/issue-open" CL_MERGED="$tmp/merged.json" CL_DAY="$DAY"
cat >"$CL_MERGED" <<EOF
[{"number":9,"title":"feat(ui): a thing","body":"## What\nA thing a player sees.","mergedAt":"${DAY}T20:00:00Z","mergeCommit":{"oid":"0000000000000000000000000000000000000000"},"url":"u","author":{"login":"a"},"labels":[]}]
EOF
run() { rm -f "$CL_GH_CALLS" "$CL_CLAUDE_CALLS"; : >"$CL_GH_CALLS"; : >"$CL_CLAUDE_CALLS"; bash "$HERE/changelog-auto.sh" "$@" >"$tmp/out" 2>&1; rc=$?; }
site_entry() { git -C "$tmp/site.git" show "changelog/$DAY:changelog/entries.json" 2>/dev/null | jq -r --arg d "$DAY" '.[]|select(.date==$d)|.headline'; }

# A day with a player-visible PR: drafted, tested, pushed, and a PR opened with auto-merge.
run "$DAY"
[ $rc -eq 0 ] && [ "$(site_entry)" = "Good" ] && grep -q "^pr create --repo x/site --base main --head changelog/$DAY --title feat(site): changelog for $DAY" "$CL_GH_CALLS" && grep -q '^pr merge .* --auto --merge' "$CL_GH_CALLS" \
  || fail "a player-visible day opens a site PR with the entry: rc=$rc $(cat "$tmp/out") $(cat "$CL_GH_CALLS")"
git -C "$tmp/site.git" show "changelog/$DAY:changelog/entries.json" | jq -e '.[0].date == "'"$DAY"'" and .[0].items[0].media[0].src == "https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media/office-box.webp"' >/dev/null || fail "the entry is newest first and the still is its raw link"
grep -q '/home/\|/tmp/' "$tmp/state/$DAY.pr.md" && fail "the PR body holds a local path"
grep -q 'Check each number and each claim' "$tmp/state/$DAY.pr.md" || fail "the PR body asks the reviewer to fact-check the text"

# The same day again without --force does nothing.
run "$DAY"
[ $rc -eq 0 ] && grep -q 'already done' "$tmp/out" && [ ! -s "$CL_CLAUDE_CALLS" ] || fail "a finished day is not drafted again: $(cat "$tmp/out")"

# --force with the PR open: the entry is replaced on the same branch and the PR updated, no second PR.
CL_STUB_HEADLINE="Second take" run "$DAY" --force
[ $rc -eq 0 ] && [ "$(site_entry)" = "Second take" ] && grep -q '^pr edit 41' "$CL_GH_CALLS" && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "a forced re-run updates the open PR: rc=$rc $(cat "$tmp/out") $(cat "$CL_GH_CALLS")"
[ "$(git -C "$tmp/site.git" show "changelog/$DAY:changelog/entries.json" | jq --arg d "$DAY" '[.[]|select(.date==$d)]|length')" = 1 ] || fail "the day has one entry after a re-run"
# An identical redraft changes nothing and pushes nothing.
before="$(git -C "$tmp/site.git" rev-parse "changelog/$DAY")"
CL_STUB_HEADLINE="Second take" run "$DAY" --force
[ $rc -eq 0 ] && grep -q 'is unchanged' "$tmp/out" && [ "$(git -C "$tmp/site.git" rev-parse "changelog/$DAY")" = "$before" ] || fail "an identical draft pushes nothing: $(cat "$tmp/out")"

# A refused first draft (an em dash) is retried with the reasons; the second one is used.
rm -f "$CL_PR_OPEN"; git -C "$tmp/site.git" branch -q -D "changelog/$DAY"
CL_STUB_MODE=retry CL_STUB_HEADLINE="After retry" run "$DAY" --force
[ $rc -eq 0 ] && [ "$(wc -l <"$CL_CLAUDE_CALLS")" -eq 2 ] && [ "$(site_entry)" = "After retry" ] || fail "a refused draft is retried once: rc=$rc calls=$(wc -l <"$CL_CLAUDE_CALLS") $(cat "$tmp/out")"
grep -q 'em dash' "$tmp/state/$DAY.prompt.md" || fail "the retry prompt carries the reasons"

# A failure opens a changelog-red issue and no PR; a repeat comments; a pass closes it.
rm -f "$CL_PR_OPEN"; git -C "$tmp/site.git" branch -q -D "changelog/$DAY"
CL_STUB_MODE=garbage run "$DAY" --force
[ $rc -eq 1 ] && grep -q '^issue create .*--label changelog-red' "$CL_GH_CALLS" && grep -q '^label create changelog-red' "$CL_GH_CALLS" && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "an unusable draft opens a changelog-red issue and no PR: rc=$rc $(cat "$tmp/out") $(cat "$CL_GH_CALLS")"
CL_STUB_MODE=fail run "$DAY" --force
[ $rc -eq 1 ] && grep -q '^issue comment 7' "$CL_GH_CALLS" && ! grep -q '^issue create' "$CL_GH_CALLS" || fail "a repeat failure comments on the open issue: $(cat "$CL_GH_CALLS")"
run "$DAY" --force
[ $rc -eq 0 ] && grep -q '^issue close 7' "$CL_GH_CALLS" && grep -q '^pr create' "$CL_GH_CALLS" || fail "a passing run closes the issue: $(cat "$CL_GH_CALLS")"

# Tests that fail on the new entry: red, nothing pushed.
rm -f "$CL_PR_OPEN"; git -C "$tmp/site.git" branch -q -D "changelog/$DAY"
CL_STUB_BODY="FAILME" run "$DAY" --force
[ $rc -eq 1 ] && grep -q 'tests fail' "$tmp/out" && ! git -C "$tmp/site.git" rev-parse -q --verify "changelog/$DAY" >/dev/null && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "failing site tests open an issue and push nothing: rc=$rc $(cat "$tmp/out")"
run "$DAY" --force >/dev/null

# --dry stops before the push.
rm -f "$CL_PR_OPEN"; git -C "$tmp/site.git" branch -q -D "changelog/$DAY"
CL_STUB_HEADLINE="Dry" run "$DAY" --force --dry
[ $rc -eq 0 ] && grep -q 'dry run' "$tmp/out" && ! git -C "$tmp/site.git" rev-parse -q --verify "changelog/$DAY" >/dev/null && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "--dry stops before the push: $(cat "$tmp/out")"

# A quiet day writes nothing and does not call the model.
echo '[]' >"$CL_MERGED"
run 2026-10-04
[ $rc -eq 0 ] && grep -q 'nothing to write' "$tmp/out" && [ ! -s "$CL_CLAUDE_CALLS" ] && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "a quiet day writes nothing: $(cat "$tmp/out")"

# Bad input.
bash "$HERE/changelog-auto.sh" tomorrow >/dev/null 2>&1; [ $? -eq 2 ] || fail "a bad argument exits 2"
bash "$HERE/changelog-auto.sh" 2026-02-30 >/dev/null 2>&1; [ $? -eq 2 ] || fail "an impossible day exits 2"

[ $fails -eq 0 ] && echo "changelog-auto: all cases pass" || echo "changelog-auto: $fails failing"
[ $fails -eq 0 ]
