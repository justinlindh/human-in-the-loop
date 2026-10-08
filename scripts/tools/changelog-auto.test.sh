#!/usr/bin/env bash
# Cases for scripts/tools/changelog-auto.sh with scratch game and site origins and stand-in gh and claude.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${HITL_TMP:=$HOME/.cache/hitl-ci/tmp}"; tmp="$(mktemp -d -p "$HITL_TMP")"; trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp" TZ=UTC
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
g() { git -c user.name=t -c user.email=t@t "$@"; }
DAY=2026-10-05

# The game origin: only history (the run's scripts are the ones next to it).
mkdir -p "$tmp/game" && cd "$tmp/game" || exit 1
echo game >README.md
git init -q -b main . && g add -A && g commit -q -m base && g checkout -q -b feature-media && : >office-box.webp && g add -A && g commit -q -m stills && g checkout -q main && git clone -q --bare . "$tmp/game.git"
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
  # PR 9 posts two stills (a before shot in a comment ranks after the after shot); PR 10 only a clip.
  "pr view 9 "*) echo '{"body":"![a](https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-9/before-main.png?raw=true)","comments":[{"body":"![b](https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-9/after.png?raw=true) [c](https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-9/x.mp4?raw=true)"}]}' ;;
  "pr view 10 "*) echo '{"body":"","comments":[{"body":"[clip](https://github.com/justinlindh/human-in-the-loop/blob/pr-media/pr-10/walk.mp4?raw=true)"}]}' ;;
  "pr view "*) echo '{"body":"","comments":[]}' ;;
esac
exit 0
EOF
cat >"$tmp/bin/claude" <<'EOF'
#!/usr/bin/env bash
echo "call" >>"$CL_CLAUDE_CALLS"
echo "$*" >>"$CL_CLAUDE_CALLS.args"
n="$(wc -l <"$CL_CLAUDE_CALLS")"
case "${CL_STUB_MODE:-ok}" in
  fail) exit 1 ;;
  garbage) echo "I could not do that." ;;
  retry) if [ "$n" -eq 1 ]; then H="Bad $(printf '\xe2\x80\x94') dash"; else H="${CL_STUB_HEADLINE:-Good}"; fi
         printf '{"date":"%s","headline":"%s","items":[{"area":"UI","title":"A thing","body":"It works.","refs":["#9"]}]}' "$CL_DAY" "$H" ;;
  # The model's own media pick is ignored: stills come from the cited PRs.
  *) printf 'Here is the entry:\n{"date":"%s","headline":"%s","items":[{"area":"UI","title":"A thing","body":"%s","refs":%s,"media":[{"src":"https://github.com/justinlindh/human-in-the-loop/blob/feature-media/office-box.webp?raw=true","kind":"image","caption":"Box"}]}%s]}\n' "$CL_DAY" "${CL_STUB_HEADLINE:-Good}" "${CL_STUB_BODY:-It works.}" "${CL_STUB_REFS:-[\"#9\"]}" "${CL_STUB_EXTRA:-}" ;;
esac
EOF
# A stand-in curl: copies a real small png, or a real two-second clip for a .mp4, to the file named by -o,
# so no still is fetched from the network and ffmpeg has real input.
ffmpeg -v error -f lavfi -i testsrc=size=320x240:rate=10 -frames:v 1 "$tmp/still.png" || exit 1
ffmpeg -v error -f lavfi -i testsrc=size=320x240:rate=10:duration=2 -pix_fmt yuv420p "$tmp/clip.mp4" || exit 1
cat >"$tmp/bin/curl" <<EOF
#!/usr/bin/env bash
url=""; out=""
while [ \$# -gt 0 ]; do case "\$1" in -o) out="\$2"; shift ;; http*) url="\$1" ;; esac; shift; done
[ -n "\$out" ] || exit 1
case "\$url" in *.mp4) cp "$tmp/clip.mp4" "\$out" ;; *) cp "$tmp/still.png" "\$out" ;; esac
EOF
chmod +x "$tmp/bin/gh" "$tmp/bin/claude" "$tmp/bin/curl"
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
git -C "$tmp/site.git" show "changelog/$DAY:changelog/entries.json" | jq -e '.[0].date == "'"$DAY"'" and ([.[0].items[0].media[].src] == ["media/'"$DAY"'/9-after.webp", "media/'"$DAY"'/9-before-main.webp"])' >/dev/null \
  || fail "the entry is newest first and its stills are the cited PR's, after shot first, as webp, not the model's pick: $(git -C "$tmp/site.git" show "changelog/$DAY:changelog/entries.json" | jq -c '.[0].items[0].media')"
git -C "$tmp/site.git" show "changelog/$DAY:changelog/media/$DAY/9-after.webp" | head -c 12 | grep -q 'WEBP' || fail "the still file is committed in the day folder as webp"
grep -q "media: A thing: media/$DAY/9-after.webp, media/$DAY/9-before-main.webp" "$tmp/out" || fail "the run says which stills each item got: $(cat "$tmp/out")"
grep -q 'Stills wanted' "$tmp/state/$DAY.pr.md" && fail "an item with stills is not flagged as wanting one"
grep -q 'office-box.webp' "$tmp/state/$DAY.stills.txt" || fail "the feature-media file list is read for the digest"
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
# The drafting run is locked down: only Read, no permission prompts, no MCP servers from config.
for f in '--tools Read' '--permission-mode dontAsk' '--strict-mcp-config'; do
  grep -q -- "$f" "$CL_CLAUDE_CALLS.args" || fail "the drafter runs with $f"
done

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

# A day the site's main already has (hand-curated): an Art item with two stills, and "A thing" exactly as
# this tool wrote and published it for the day above (its record names it, text and stills).
g clone -q "$tmp/site.git" "$tmp/sitework" && cd "$tmp/sitework" || exit 1
mkdir -p "changelog/media/$DAY" && printf a >"changelog/media/$DAY/art-1.webp" && printf b >"changelog/media/$DAY/art-2.webp"
cp "$tmp/still.png" "changelog/media/$DAY/9-after.webp" && cp "$tmp/still.png" "changelog/media/$DAY/9-before-main.webp"
jq --arg d "$DAY" '[{date: $d, headline: "Curated day", items: [
  {area: "Art", title: "New art, rendered clean", body: "Stills.", media: [{src: "media/\($d)/art-1.webp", kind: "image"}, {src: "media/\($d)/art-2.webp", kind: "image"}]},
  {area: "UI", title: "A thing", body: "It works.", refs: ["#9"], media: [{src: "media/\($d)/9-after.webp", kind: "image"}, {src: "media/\($d)/9-before-main.webp", kind: "image"}]}]}] + .' changelog/entries.json >e.json && mv e.json changelog/entries.json
g add -A && g commit -q -m curated && git push -q origin main
cd "$HERE" || exit 1
site_day() { jq -c --arg d "$DAY" '.[] | select(.date == $d)' "$tmp/state/site/changelog/entries.json"; }
rm -f "$tmp/state/done/$DAY" "$CL_PR_OPEN"

# Without --force the timer skips it, without calling the model.
run "$DAY"
[ $rc -eq 0 ] && grep -q "already has an entry on the site's main" "$tmp/out" && [ ! -s "$CL_CLAUDE_CALLS" ] && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "a day on the site's main is skipped: rc=$rc $(cat "$tmp/out")"

# --force keeps the curated Art item and its stills and the curated headline; "A thing" is redrafted.
CL_STUB_HEADLINE="Redraft" CL_STUB_BODY="Redrafted." run "$DAY" --force --dry
[ $rc -eq 0 ] && grep -q 'keeping 1 published item(s) and the headline' "$tmp/out" || fail "a forced published day says what it keeps: rc=$rc $(cat "$tmp/out")"
site_day | jq -e '.headline == "Curated day" and ([.items[].title] == ["New art, rendered clean", "A thing"]) and .items[0].media[1].src == "media/'"$DAY"'/art-2.webp" and .items[1].body == "Redrafted."' >/dev/null \
  || fail "the curated item and headline are kept and the tool's own item redrafted: $(site_day)"
[ "$(ls "$tmp/state/site/changelog/media/$DAY" | tr '\n' ' ')" = "9-after.webp 9-before-main.webp art-1.webp art-2.webp " ] || fail "the kept stills stay beside the new ones: $(ls "$tmp/state/site/changelog/media/$DAY")"
[ "$(cat "$tmp/state/site/changelog/media/$DAY/art-1.webp")" = a ] || fail "a kept still is not fetched over"
grep -q -- '- Art: New art, rendered clean' "$tmp/state/$DAY.prompt.md" || fail "the prompt lists the items that stay"

# "A thing" edited by hand after it was published (same title, new text): the record's fingerprint no longer
# matches, so it is kept, and the drafted one with its title is left out.
cd "$tmp/sitework" || exit 1
jq --arg d "$DAY" 'map(if .date == $d then .items[1].body = "Fixed by hand." else . end)' changelog/entries.json >e.json && mv e.json changelog/entries.json
g commit -q -am "hand edit" && git push -q origin main
cd "$HERE" || exit 1
CL_STUB_HEADLINE="Redraft" CL_STUB_BODY="Redrafted." run "$DAY" --force --dry
[ $rc -eq 0 ] && grep -q 'keeping 2 published item(s) and the headline' "$tmp/out" && site_day | jq -e '[.items[].title] == ["New art, rendered clean", "A thing"] and .items[1].body == "Fixed by hand."' >/dev/null \
  || fail "an item edited by hand keeps its edit: rc=$rc $(site_day) $(cat "$tmp/out")"

# With no record of what this tool wrote, everything published is kept, and a drafted item with a kept title is left out.
rm -f "$tmp/state/$DAY.ours.json"
CL_STUB_HEADLINE="Redraft" CL_STUB_BODY="Redrafted." run "$DAY" --force --dry
[ $rc -eq 0 ] && site_day | jq -e '[.items[].title] == ["New art, rendered clean", "A thing"] and .items[1].body == "Fixed by hand."' >/dev/null \
  && [ "$(ls "$tmp/state/site/changelog/media/$DAY" | tr '\n' ' ')" = "9-after.webp 9-before-main.webp art-1.webp art-2.webp " ] || fail "with no record everything published is kept: rc=$rc $(site_day) $(cat "$tmp/out")"

# Days are UTC's whatever the machine's zone: a merge at 03:00Z on the 7th is the 7th's (the 6th in Los Angeles).
cat >"$CL_MERGED" <<'EOF'
[{"number":10,"title":"feat(ui): a late thing","body":"## What\nA thing a player sees.","mergedAt":"2026-10-07T03:00:00Z","mergeCommit":{"oid":"0000000000000000000000000000000000000000"},"url":"u","author":{"login":"a"},"labels":[]}]
EOF
# PR 10 posts only a clip, so its item gets a frame from the clip's middle. An item citing no PR of the day
# that has media is listed for video in the PR body, unless its area is not about the screen.
rm -f "$CL_PR_OPEN"
TZ=America/Los_Angeles CL_DAY=2026-10-07 CL_STUB_REFS='["#10"]' \
  CL_STUB_EXTRA=',{"area":"Office","title":"A plant","body":"Green.","refs":["#11"]},{"area":"Sound","title":"A hum","body":"Quiet.","refs":[]}' run 2026-10-07
[ $rc -eq 0 ] && grep -q '2026-10-07: 1 player-visible change' "$tmp/out" || fail "a 03:00Z merge lands on its UTC day: rc=$rc $(cat "$tmp/out")"
git -C "$tmp/site.git" show "changelog/2026-10-07:changelog/entries.json" | jq -e '.[0].items[0].media == [{"src": "media/2026-10-07/10-walk-frame.webp", "kind": "image", "caption": "A late thing"}] and .[0].items[1].media == null' >/dev/null \
  || fail "a clip-only PR gives its item a frame: $(git -C "$tmp/site.git" show "changelog/2026-10-07:changelog/entries.json" | jq -c '.[0].items')"
git -C "$tmp/site.git" show "changelog/2026-10-07:changelog/media/2026-10-07/10-walk-frame.webp" | head -c 12 | grep -q WEBP || fail "the frame is a webp file"
grep -q '^## Stills wanted' "$tmp/state/2026-10-07.pr.md" && grep -q '^- Office: A plant (#11)' "$tmp/state/2026-10-07.pr.md" && ! grep -q 'A hum' <(sed -n '/^## Stills wanted/,/^## For/p' "$tmp/state/2026-10-07.pr.md") \
  || fail "an on-screen item with no still is flagged for video, a sound item is not: $(cat "$tmp/state/2026-10-07.pr.md")"
TZ=America/Los_Angeles run 2026-10-06
[ $rc -eq 0 ] && grep -q 'nothing to write' "$tmp/out" && [ ! -s "$CL_CLAUDE_CALLS" ] || fail "a 03:00Z merge is not the zone's day before: rc=$rc $(cat "$tmp/out")"

# A quiet day writes nothing and does not call the model.
echo '[]' >"$CL_MERGED"
run 2026-10-04
[ $rc -eq 0 ] && grep -q 'nothing to write' "$tmp/out" && [ ! -s "$CL_CLAUDE_CALLS" ] && ! grep -q '^pr create' "$CL_GH_CALLS" || fail "a quiet day writes nothing: $(cat "$tmp/out")"

# Bad input.
bash "$HERE/changelog-auto.sh" tomorrow >/dev/null 2>&1; [ $? -eq 2 ] || fail "a bad argument exits 2"
bash "$HERE/changelog-auto.sh" 2026-02-30 >/dev/null 2>&1; [ $? -eq 2 ] || fail "an impossible day exits 2"

[ $fails -eq 0 ] && echo "changelog-auto: all cases pass" || echo "changelog-auto: $fails failing"
[ $fails -eq 0 ]
