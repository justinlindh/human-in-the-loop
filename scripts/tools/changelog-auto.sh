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
# changed. A day that finished is not drafted again by the timer (--force runs it anyway).
# A failure (no usable draft, failing tests, a push that fails) opens an issue labelled changelog-red in
# this repository, or comments on the open one, and a passing run closes it. No broken PR is opened.
#
# Usage: scripts/tools/changelog-auto.sh [<YYYY-MM-DD>] [--force] [--dry]
#        --dry stops before the push and the PR (the entry is left in the site clone's branch)
# Env: CL_STATE (default ~/.cache/hitl-ci/changelog-auto), CL_GAME_ORIGIN (default this checkout's origin),
#      CL_SITE_ORIGIN and CL_SITE_REPO (the site repository: git url and owner/name), CL_MODEL (default
#      haiku), CL_CLAUDE (the claude command; a stand-in for tests), CL_BUDGET (dollars per draft, default
#      2), GH (a stand-in for tests).
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
[ -n "$day" ] || day="$(date -d yesterday +%F)"
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

# 1. The day's player-visible changes.
data="$STATE/$day.json"
( cd "$game" && node "$HERE/day-changes.mjs" "$day" --no-fetch ) >"$data" 2>>"$log" || fail "day-changes.mjs failed for $day"
n="$(jq '[.days[0].prs[], .days[0].direct[]] | length' "$data" 2>/dev/null)" || fail "day-changes.mjs gave no JSON for $day"
if [ "${n:-0}" -eq 0 ]; then say "no player-visible change on $day; nothing to write"; touch "$STATE/done/$day"; report_green; exit 0; fi
say "$day: $n player-visible change(s)"
# Art's object stills live on the feature-media branch (office-<id>.webp, decision-<id>.webp); the digest
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
    echo "Write the entry: a headline for the day, then items, one per thing a player would notice. Rules:"
    echo "- Gameplay first, then how it looks. Say what a new object or choice does in play, with the numbers from the effects lines when they are there. Say it the way a player would, not the way a developer would."
    echo "- Group small fixes into one item. Skip anything a player cannot see or feel. Do not invent: every claim comes from the digest."
    echo "- Stills only. Each item may carry media: [{ \"src\": <a still URL from the digest, exactly as written>, \"kind\": \"image\", \"caption\": <short> }]. Use only stills the digest lists. Never a clip or GIF."
    echo "- Every new object or choice (a feature the digest marks added) gets its still in its item, when the digest lists one for it. Several new objects may share an item; each keeps its own still."
    echo "- refs: the PR numbers behind the item, like [\"#1451\"]."
    echo "- No em dashes (use a comma, a colon or two sentences). Say company or lab, never startup."
    echo
    echo "Reply with exactly one JSON object and nothing else (no code fence): { \"date\": \"$day\", \"headline\": ..., \"items\": [ { \"area\": ..., \"title\": ..., \"body\": ..., \"refs\": [...], \"media\": [...] } ] }"
    [ -n "$1" ] && { echo; echo "Your last draft was refused. Fix exactly these problems and reply with the whole corrected JSON object:"; echo "$1"; }
  } >"$prompt"
}
draft="$STATE/$day.draft.json"
applied=0; feedback=""
for attempt in 1 2; do
  write_prompt "$feedback"
  say "drafting (attempt $attempt, model $MODEL)"
  if ! timeout 900 $CLAUDE -p "$(cat "$prompt")" --model "$MODEL" --tools Read --permission-mode dontAsk --strict-mcp-config --add-dir "$STATE" --add-dir "$site" \
      --no-session-persistence --max-budget-usd "${CL_BUDGET:-2}" >"$STATE/$day.draft.raw" 2>>"$log" </dev/null; then
    feedback="The drafting run itself failed."; continue
  fi
  # The JSON object in the reply: from the first { to the last }.
  if ! node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a<0||b<a)process.exit(1);JSON.parse(s.slice(a,b+1));require("fs").writeFileSync(process.argv[2],s.slice(a,b+1))' "$STATE/$day.draft.raw" "$draft" 2>>"$log"; then
    feedback="The reply was not one JSON object."; continue
  fi
  if err="$(node "$HERE/changelog-apply.mjs" "$site" "$day" "$draft" 2>&1)"; then applied=1; echo "$err" >>"$log"; break; fi
  echo "$err" >>"$log"; feedback="$err"
done
[ "$applied" = 1 ] || fail "no usable draft after two attempts (${feedback:0:200})"

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
  echo "## For the reviewer"; echo
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
touch "$STATE/done/$day"
report_green
exit 0
