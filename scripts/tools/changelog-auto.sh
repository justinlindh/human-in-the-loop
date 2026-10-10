#!/usr/bin/env bash
# Keeps the site changelog (humanintheloopgame.com/changelog/) in step with the game: for a day (by
# default yesterday) it lists the player-visible PRs (scripts/tools/day-changes.mjs), has a headless
# cheap-model run draft that day's entry in the site's voice, puts it in changelog/entries.json
# (scripts/tools/changelog-apply.mjs), runs the site's tests and opens a site PR that review and
# auto-merge then handle. A day with no player-visible change writes nothing.
# Run by hitl-changelog.timer. It works in its own clones (the game's, for the merge history, and the
# site's), so nobody's checkout is touched; the scripts it calls are the ones next to it.
#
# Idempotent: a day has one branch, changelog/<day>, and one PR. Running a day again drafts it afresh and
# replaces that day's entry; an open PR gets a new commit, a merged one gets a new PR only when the text
# changed. A day that finished, or that already has an entry on the site's main, is not drafted again by
# the timer; --force runs it anyway but keeps the published items it did not write.
# A failure (no usable draft, failing tests, a push that fails) opens an issue labelled changelog-red in
# this repository, or comments on the open one, and a passing run closes it. No broken PR is opened.
#
# Usage: scripts/tools/changelog-auto.sh [<YYYY-MM-DD>] [--force] [--dry]
#        --dry stops before the push and the PR (the entry is left in the site clone's branch)
# Env: CL_STATE (default ~/.cache/hitl-ci/changelog-auto), CL_GAME_ORIGIN (default this checkout's origin),
#      CL_SITE_ORIGIN and CL_SITE_REPO (the site repository: git url and owner/name), CL_MODEL (the
#      drafter, default haiku), CL_CHECK_MODEL (the still check, default sonnet), CL_STILL_CHECK=0 (no
#      still check), CL_CLAUDE (the claude command; a stand-in for tests), CL_BUDGET (dollars per day for
#      the draft and the still check together, default 2), GH (a stand-in for tests).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/../lib/tmpdir.sh"
STATE="${CL_STATE:-$HOME/.cache/hitl-ci/changelog-auto}"
GH="${GH:-gh}"
CLAUDE="${CL_CLAUDE:-claude}"
MODEL="${CL_MODEL:-haiku}"
SITE_REPO="${CL_SITE_REPO:-justinlindh/humanintheloopgame-site}"
SITE_ORIGIN="${CL_SITE_ORIGIN:-git@github.com:$SITE_REPO.git}"
force=0; dry=0; day=""
for a in "$@"; do
  case "$a" in
    --force) force=1 ;;
    --dry) dry=1 ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) day="$a" ;;
    *) echo "usage: changelog-auto.sh [<YYYY-MM-DD>] [--force] [--dry]" >&2; exit 2 ;;
  esac
done
# The site's changelog groups merges by UTC day, so the day and its merges are UTC's.
[ -n "$day" ] || day="$(date -u -d yesterday +%F)"
date -d "$day" +%F >/dev/null 2>&1 || { echo "changelog-auto: not a day: $day" >&2; exit 2; }
mkdir -p "$STATE/done"
exec 7>"$STATE/lock"
flock -n 7 || { echo "changelog-auto: another run is going"; exit 0; }

game_origin="${CL_GAME_ORIGIN:-$(git -C "$HERE/../.." remote get-url origin)}"
game="$STATE/game"; site="$STATE/site"
log="$STATE/$day.log"; : >"$log"
say() { echo "[changelog-auto $(date +%H:%M:%S)] $*" | tee -a "$log"; }
branch="changelog/$day"

own_issues() { "$GH" issue list --state open --label changelog-red --json number --jq '.[].number' 2>/dev/null; }
report_red() { # <what>
  local body issue; body="$STATE/$day.issue.md"
  { echo "<!-- changelog-auto -->"; echo "The changelog entry for $day was not made: $1"; echo; echo '```'; tail -n 30 "$log"; echo '```'; } >"$body"
  ( cd "$game" 2>/dev/null || cd "$STATE"
    "$GH" label create changelog-red --color b60205 --description "the daily changelog draft or its site PR fails" >/dev/null 2>&1
    issue="$(own_issues | head -n 1)"
    if [ -n "$issue" ]; then "$GH" issue comment "$issue" --body-file "$body" >/dev/null && say "commented on #$issue"
    else "$GH" issue create --title "changelog for $day failed" --label changelog-red --body-file "$body" >/dev/null && say "opened a changelog-red issue"; fi )
}
report_green() {
  local n
  ( cd "$game" 2>/dev/null || cd "$STATE"
    for n in $(own_issues); do "$GH" issue close "$n" --comment "Green again for $day: the changelog entry was made." >/dev/null && say "closed #$n"; done )
}
fail() { say "FAILED: $1"; report_red "$1"; exit 1; }

clone() { # <origin> <dir> [clone options]
  [ -d "$2/.git" ] || git clone -q "${@:3}" "$1" "$2" >>"$log" 2>&1 || return 1
  git -C "$2" fetch -q origin main >>"$log" 2>&1
}

if [ "$force" = 0 ] && [ -e "$STATE/done/$day" ]; then say "$day already done"; exit 0; fi
# Only the merge history and the docs/features diffs are read, so the game clone has no working files
# and fetches file contents as they are needed.
clone "$game_origin" "$game" --no-checkout --filter=blob:none || fail "cloning the game repository failed"
clone "$SITE_ORIGIN" "$site" || fail "cloning the site repository failed"

# A day with an entry on the site's main is published (by this tool or by hand), so the timer leaves it.
# --force redrafts it but keeps, unchanged with their stills, the published items and headline this
# tool did not write: anything not in its record of what it published for the day ($day.ours.json, each
# item's title and a fingerprint of its text and media, so an item edited by hand since is kept; with no
# record, everything published is kept).
ours="$STATE/$day.ours.json"; keep="$STATE/$day.keep.json"; rm -f "$keep"
published="$(git -C "$site" show origin/main:changelog/entries.json 2>>"$log" | jq -c --arg d "$day" 'first(.[] | select(.date == $d)) // empty' 2>>"$log")"
if [ -n "$published" ]; then
  if [ "$force" = 0 ]; then say "$day already has an entry on the site's main; not drafting it again (--force redrafts it and keeps what this tool did not write)"; touch "$STATE/done/$day"; exit 0; fi
  echo "$published" >"$STATE/$day.published.json"
  node "$HERE/changelog-apply.mjs" keep "$STATE/$day.published.json" "$ours" >"$keep" 2>>"$log" || fail "reading the published entry for $day failed"
  if jq -e '.headline == null and (.items | length) == 0' "$keep" >/dev/null; then rm -f "$keep"
  else say "keeping $(jq '.items | length' "$keep") published item(s)$(jq -r 'if .headline then " and the headline" else "" end' "$keep") this tool did not write"; fi
fi
kargs=(); [ -f "$keep" ] && kargs=(--keep "$keep")

# 1. The day's player-visible changes.
data="$STATE/$day.json"
( cd "$game" && node "$HERE/day-changes.mjs" "$day" --tz UTC --no-fetch ) >"$data" 2>>"$log" || fail "day-changes.mjs failed for $day"
n="$(jq '[.days[0].prs[], .days[0].direct[]] | length' "$data" 2>/dev/null)" || fail "day-changes.mjs gave no JSON for $day"
if [ "${n:-0}" -eq 0 ]; then say "no player-visible change on $day; nothing to write"; touch "$STATE/done/$day"; report_green; exit 0; fi
say "$day: $n player-visible change(s)"
# Art's object stills live on the feature-media branch (<kind>-<id>.webp or .png); the digest
# links each feature to the one with its id.
: >"$STATE/$day.stills.txt"
if git -C "$game" fetch -q origin feature-media >>"$log" 2>&1; then git -C "$game" ls-tree --name-only origin/feature-media >"$STATE/$day.stills.txt" 2>>"$log"; fi
node "$HERE/changelog-digest.mjs" "$data" "$day" "$STATE/$day.stills.txt" >"$STATE/$day.digest.md" 2>>"$log" || fail "making the digest failed"

# 2. The site branch: the open PR's, if there is one, else a fresh one from main.
git -C "$site" reset -q --hard >>"$log" 2>&1; git -C "$site" clean -qfd >>"$log" 2>&1
pr="$("$GH" pr list --repo "$SITE_REPO" --head "$branch" --state open --json number --jq '.[0].number // empty' 2>/dev/null)"
if [ -n "$pr" ] && git -C "$site" fetch -q origin "$branch" >>"$log" 2>&1; then
  git -C "$site" checkout -q -B "$branch" "origin/$branch" >>"$log" 2>&1 || fail "checking out the open PR's branch failed"
  git -C "$site" -c user.name=changelog-auto -c user.email=changelog-auto@localhost merge -q --no-edit origin/main >>"$log" 2>&1 || fail "merging main into $branch conflicts"
  say "updating PR #$pr"
else
  pr=""
  git -C "$site" checkout -q -B "$branch" origin/main >>"$log" 2>&1 || fail "branching from the site's main failed"
fi
( cd "$site" && { npm ls --depth=0 >/dev/null 2>&1 || npm ci --no-audit --no-fund; } ) >>"$log" 2>&1 </dev/null || fail "npm ci in the site failed"

# 3. The draft, and the entry it makes. One retry hands the model the reasons the first draft was refused.
voice="CHANGELOG-VOICE.md"; [ -f "$site/$voice" ] || voice=""
prompt="$STATE/$day.prompt.md"
write_prompt() { # <feedback>
  {
    echo "You write one day's entry for the Human in the Loop changelog on humanintheloopgame.com. The day is $day."
    echo
    echo "Read these first, with the Read tool:"
    [ -n "$voice" ] && echo "- The voice guide: $site/$voice. Follow it."
    echo "- $site/changelog/entries.json: the first three entries show the format and the voice. Match them."
    echo "- $STATE/$day.digest.md: what changed that day (merged PRs, the feature entries they changed with still links, and the generated effects numbers). It can be long; read it all (use offset and limit to page)."
    echo
    if [ -f "$keep" ]; then
      echo "The site already shows these items for $day, and they stay as they are. Write items only for changes they do not cover (a drafted item with one of these titles is left out):"
      jq -r '.items[] | "- \(.area): \(.title)"' "$keep"
      echo
    fi
    echo "Write the entry: a headline for the day, then items, one per thing a player would notice. Rules:"
    echo "- Gameplay first, then how it looks. Say what a new object or choice does in play, with the numbers from the effects lines when they are there. Say it the way a player would, not the way a developer would."
    echo "- Group small fixes into one item. Skip anything a player cannot see or feel. Do not invent: every claim comes from the digest."
    echo "- refs: every PR number behind the item, like [\"#1451\", \"#1460\"]. The item's stills are picked from these PRs after you reply, so list each PR the item is about, and no others. Do not add media yourself."
    echo "- No em dashes (use a comma, a colon or two sentences). Say company or lab, never startup."
    echo
    echo "Reply with exactly one JSON object and nothing else (no code fence): { \"date\": \"$day\", \"headline\": ..., \"items\": [ { \"area\": ..., \"title\": ..., \"body\": ..., \"refs\": [...] } ] }"
    [ -n "$1" ] && { echo; echo "Your last draft was refused. Fix exactly these problems and reply with the whole corrected JSON object:"; echo "$1"; }
  } >"$prompt"
}
draft="$STATE/$day.draft.json"
budget="${CL_BUDGET:-2}"; spent=0
# The still check (below) makes the final cut of each item's stills, so the rules hand it more candidates.
check=1; [ "${CL_STILL_CHECK:-1}" = 0 ] && check=0
capargs=(); [ "$check" = 1 ] && capargs=(--cap 6)
applied=0; feedback=""
for attempt in 1 2; do
  write_prompt "$feedback"
  say "drafting (attempt $attempt, model $MODEL)"
  left="$(node -e 'console.log(Math.max(0, Number(process.argv[1]) - Number(process.argv[2])).toFixed(2))' "$budget" "$spent")"
  if ! timeout 900 $CLAUDE -p "$(cat "$prompt")" --model "$MODEL" --tools Read --permission-mode dontAsk --strict-mcp-config --add-dir "$STATE" --add-dir "$site" \
      --no-session-persistence --max-budget-usd "$left" --output-format json >"$STATE/$day.draft.raw" 2>>"$log" </dev/null; then
    feedback="The drafting run itself failed."; continue
  fi
  # The reply's text (claude's JSON output wraps it with what the run cost), then the JSON object in it:
  # from the first { to the last }. The cost so far goes to $day.spent.
  if ! node -e 'const fs=require("fs");let s=fs.readFileSync(process.argv[1],"utf8"),c=0;try{const j=JSON.parse(s);if(typeof j.result==="string"){s=j.result;c=Number(j.total_cost_usd)||0}}catch{}fs.writeFileSync(process.argv[3],String(Number(process.argv[4])+c));const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a<0||b<a)process.exit(1);JSON.parse(s.slice(a,b+1));fs.writeFileSync(process.argv[2],s.slice(a,b+1))' \
      "$STATE/$day.draft.raw" "$draft" "$STATE/$day.spent" "$spent" 2>>"$log"; then
    spent="$(cat "$STATE/$day.spent" 2>/dev/null || echo "$spent")"; feedback="The reply was not one JSON object."; continue
  fi
  spent="$(cat "$STATE/$day.spent")"
  if err="$(node "$HERE/changelog-apply.mjs" "$site" "$day" "$draft" ${kargs[@]+"${kargs[@]}"} --media "$data" --stills "$STATE/$day.stills.txt" ${capargs[@]+"${capargs[@]}"} 2>&1)"; then
    applied=1; echo "$err" >>"$log"; echo "$err" >"$STATE/$day.apply.txt"
    grep '^changelog-apply: media: ' "$STATE/$day.apply.txt" | sed 's/^changelog-apply: //' | while IFS= read -r l; do say "$l"; done
    break
  fi
  echo "$err" >>"$log"; feedback="$err"
done
[ "$applied" = 1 ] || fail "no usable draft after two attempts (${feedback:0:200})"

# 3b. The still check: a cheap model looks at each picked still next to its item, keeps up to three that
# show what the item says, and captions them from what is visible, with what the draft left of the budget.
left="$(node -e 'console.log(Math.max(0, Number(process.argv[1]) - Number(process.argv[2])).toFixed(2))' "$budget" "$spent")"
# Sonnet: haiku's verdicts on the same stills change from run to run (an overhead frame passed as first person).
cargs=(--budget "$left" --model "${CL_CHECK_MODEL:-sonnet}" --raw "$STATE/$day.check.raw"); [ "$check" = 1 ] || cargs=(--trim-only)
CL_CLAUDE="$CLAUDE" node "$HERE/changelog-still-check.mjs" "$site" "$day" ${kargs[@]+"${kargs[@]}"} "${cargs[@]}" >"$STATE/$day.check.txt" 2>>"$log" || fail "the still check failed"
cat "$STATE/$day.check.txt" >>"$log"
grep -E '^(check|kept|turned down):' "$STATE/$day.check.txt" | while IFS= read -r l; do say "still check: $l"; done

# 4. The site's own tests.
( cd "$site" && npm test ) >"$STATE/$day.test.log" 2>&1 </dev/null; rc=$?
tail -n 12 "$STATE/$day.test.log" >>"$log"
[ $rc -eq 0 ] || fail "the site's tests fail on the new entry (exit $rc)"
if git -C "$site" diff --quiet HEAD -- changelog && [ -z "$(git -C "$site" status --porcelain -- changelog)" ]; then
  say "the entry for $day is unchanged"; touch "$STATE/done/$day"; report_green; exit 0
fi
[ "$dry" = 0 ] || { say "dry run: stopping before the push (entry written in $site on $branch)"; exit 0; }

# 5. The commit, the push and the PR.
git -C "$site" add changelog >>"$log" 2>&1
git -C "$site" -c user.name="${GIT_AUTHOR_NAME:-changelog-auto}" -c user.email="${GIT_AUTHOR_EMAIL:-changelog-auto@localhost}" commit -q -m "feat(site): changelog for $day" >>"$log" 2>&1 || fail "committing failed"
if ! git -C "$site" push -q -u origin "$branch" >>"$log" 2>&1; then
  # The branch exists with an earlier draft: replace exactly that commit, nothing newer.
  git -C "$site" fetch -q origin "$branch" >>"$log" 2>&1 || fail "fetching $branch failed"
  expect="$(git -C "$site" rev-parse "refs/remotes/origin/$branch")"
  git -C "$site" push -q --force-with-lease="$branch:$expect" -u origin "$branch" >>"$log" 2>&1 || fail "pushing $branch failed"
fi
titles="$(jq -r --arg d "$day" '.[]|select(.date==$d)|.items[]|"- \(.area): \(.title)"' "$site/changelog/entries.json")"
body="$STATE/$day.pr.md"
{
  echo "## What"; echo
  echo "The changelog entry for $day, drafted from that day's merged player-visible PRs and their feature entries by the daily changelog run, then checked by the site's tests."; echo
  echo "## Changes"; echo; echo "$titles"; echo
  wanted="$( { sed -n 's/^changelog-apply: wanted: /- /p' "$STATE/$day.apply.txt"; sed -n 's/^wanted: /- /p' "$STATE/$day.check.txt"; } 2>/dev/null)"
  if [ -n "$wanted" ]; then
    echo "## Stills wanted"; echo
    echo "video: these items are about something on screen and have no still: the PRs they cite gave none (none posted, no clip to take a frame from, or a download that failed), or the still check turned down every one (reasons below). Add a still to each (changelog/media/$day/, a crop when the thing is small) on this branch, or say in a comment why it needs none."; echo
    echo "$wanted"; echo
  fi
  down="$(sed -n 's/^turned down: /- /p' "$STATE/$day.check.txt" 2>/dev/null | sed "s#media/$day/##")"
  if [ -n "$down" ]; then
    echo "## Stills the still check turned down"; echo
    echo "$down"; echo
  fi
  echo "## For the reviewer"; echo
  echo "Each item's stills were picked by rule from the PRs it cites (their feature stills first, then stills posted on the PR, else a frame from the middle of a PR clip), then looked at by a cheap model next to the item's text, which kept up to three that show what the item says and wrote their captions ($(sed -n 's/^check: //p' "$STATE/$day.check.txt" 2>/dev/null | head -n 1)). Check each still shows what its item says."; echo
  echo "The text is written by a model from the day's merged PRs and feature entries, and it has been wrong before (multipliers, which starts exist). Check each number and each claim against the game's code and docs/effects at that day's commit before the verdict; the site cannot merge this PR without one."; echo
  echo "## Evidence"; echo
  echo "- **Checks:** \`npm test\` passes (the changelog and site checks)."
  echo "- **Screenshots:** none; the entry is data and stills the page already shows."; echo
  echo "## Checklist"; echo
  echo "- [x] Commits and the PR title follow Conventional Commits (\`type(scope): summary\`)"
  echo "- [x] \`scripts/check.sh\` passes (run by the site's CI)"
  echo "- [x] No local paths and no Claude attribution anywhere in the PR or its commits"
} >"$body"
if [ -n "$pr" ]; then
  "$GH" pr edit "$pr" --repo "$SITE_REPO" --body-file "$body" >>"$log" 2>&1
  say "updated PR #$pr"
else
  url="$("$GH" pr create --repo "$SITE_REPO" --base main --head "$branch" --title "feat(site): changelog for $day" --body-file "$body" 2>>"$log")" || fail "opening the site PR failed"
  say "opened $url"
  "$GH" pr merge "$url" --auto --merge >>"$log" 2>&1 || say "auto-merge could not be turned on (the site's merge rules decide)"
fi
# What this tool wrote for the day, as published: the headline unless a kept one won, and each of its
# items' title and fingerprint.
node "$HERE/changelog-apply.mjs" record "$site" "$day" ${kargs[@]+"${kargs[@]}"} >"$ours.tmp" 2>>"$log" && mv "$ours.tmp" "$ours" || say "could not record what was written for $day"
touch "$STATE/done/$day"
report_green
exit 0
