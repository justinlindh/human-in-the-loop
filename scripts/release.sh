#!/usr/bin/env bash
# Cuts a release: runs the whole suite on a commit of main and publishes it only if everything passes.
# PRs merge on the quick `smoke` check (scripts/smoke.sh); this is where the rest runs, on this machine
# (it has the GPU): the full vitest suite, balance, the browser checks, render checks, golden, phone check,
# the scene sweep and the tool self-tests. That is the main guard's run (scripts/main-guard.sh), run on
# demand at one commit and posting nothing itself.
#   all green  the commit gets the `release-gate` status and release.yml is dispatched for it:
#              semantic-release tags the next version and Pages deploys it
#   anything red, or the run cannot judge  nothing is published; one issue labelled release-red opens (or
#              takes a comment) naming the commit and the failing steps
# Usage: scripts/release.sh [--sha <rev>] [--dry-run]
#   --sha      release this commit instead of origin/main's tip
#   --dry-run  run the suite, then print what would happen: no status, no issue, and release.yml is only
#              asked for its own dry run (it prints the next version and publishes nothing)
# Env: RELEASE_GUARD replaces the suite command (tests), RELEASE_REPO the repository for gh calls.
set -uo pipefail
usage="usage: scripts/release.sh [--sha <rev>] [--dry-run]"
sha_arg=""; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) sha_arg="${2:?$usage}"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
cd "$(git rev-parse --show-toplevel)" || exit 2
git fetch -q origin main || { echo "release: cannot fetch origin/main" >&2; exit 2; }
sha="$(git rev-parse "${sha_arg:-origin/main}")" || exit 2
short="${sha:0:8}"
subject="$(git log -1 --format=%s "$sha")"
log="$(mktemp "${TMPDIR:-/tmp}/release.XXXXXX")"; trap 'rm -f "$log"' EXIT
echo "release: running the whole suite on $short ($subject)"
t0=$SECONDS
if [ -n "${RELEASE_GUARD:-}" ]; then bash -c "$RELEASE_GUARD" >"$log" 2>&1; else bash scripts/main-guard.sh --sha "$sha" --no-post >"$log" 2>&1; fi
rc=$?
secs=$(( SECONDS - t0 ))
cat "$log"
verdict=""
if grep -q "another guard is running" "$log"; then echo "release: the main guard is running; wait for it to finish" >&2; exit 2
elif [ $rc -eq 0 ] && grep -q " PASS in " "$log"; then verdict=pass
elif grep -q "could not judge" "$log"; then verdict=unjudged
else verdict=fail; fi
what="$(sed -n 's/^main-guard: [0-9a-f]* FAIL (\(.*\)) in [0-9]*s$/\1/p' "$log" | head -n 1)"
[ -n "$what" ] || what="$([ "$verdict" = unjudged ] && sed -n 's/^main-guard: could not judge [0-9a-f]* (\(.*\)); no verdict$/\1/p' "$log" | head -n 1 || true)"
[ -n "$what" ] || what="see the run's log"

repo=(); slug='{owner}/{repo}'
[ -n "${RELEASE_REPO:-}" ] && { repo=(--repo "$RELEASE_REPO"); slug="$RELEASE_REPO"; }
if [ "$verdict" = pass ]; then
  echo "release: $short passed the whole suite in ${secs}s"
  if [ $dry = 1 ]; then
    echo "release: dry run: would set release-gate and dispatch release.yml for $short"
    gh workflow run release.yml "${repo[@]}" -f sha="$sha" -f dry_run=true && echo "release: asked release.yml for a dry run (it prints the next version)"
    exit 0
  fi
  gh api "repos/$slug/statuses/$sha" -f state=success -f context=release-gate -f description="The whole suite passed in ${secs}s" >/dev/null \
    || { echo "release: could not set the release-gate status" >&2; exit 2; }
  gh workflow run release.yml "${repo[@]}" -f sha="$sha" -f dry_run=false || { echo "release: could not dispatch release.yml" >&2; exit 2; }
  echo "release: dispatched release.yml for $short"
  # An earlier blocked release is cleared by this one.
  open="$(gh issue list "${repo[@]}" --label release-red --state open --json number --jq '.[0].number // empty')"
  [ -z "$open" ] || gh issue close "$open" "${repo[@]}" --comment "Released from $short: the whole suite passes." >/dev/null
  exit 0
fi

echo "release: $short is NOT released ($verdict: $what)"
body="$(mktemp "${TMPDIR:-/tmp}/release-issue.XXXXXX")"
{
  echo "The release was not cut: the whole suite $([ "$verdict" = unjudged ] && echo "could not be judged" || echo "failed") on \`$short\` ($subject) after ${secs}s."
  echo
  echo "Failing steps: **$what**"
  echo
  echo "Nothing was published. Fix forward or revert, then run \`scripts/release.sh\` again."
} >"$body"
if [ $dry = 1 ]; then echo "--- release-red issue (dry run, not opened) ---"; cat "$body"; rm -f "$body"; exit 1; fi
gh label create release-red "${repo[@]}" --color B60205 --description "the release suite failed" 2>/dev/null || true
open="$(gh issue list "${repo[@]}" --label release-red --state open --json number --jq '.[0].number // empty')"
if [ -n "$open" ]; then gh issue comment "$open" "${repo[@]}" --body-file "$body" >/dev/null && echo "release: commented on #$open"
else gh issue create "${repo[@]}" --label release-red --title "release blocked at $short: $what" --body-file "$body" && echo "release: opened a release-red issue"; fi
rm -f "$body"
exit 1
