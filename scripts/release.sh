#!/usr/bin/env bash
# Cuts a release: runs the whole suite on a commit of main and publishes it only if everything passes.
# PRs merge on the quick `smoke` check (scripts/smoke.sh); this is where the rest runs, on this machine
# (it has the GPU): the full vitest suite, balance, the browser checks, render checks, golden, phone check,
# the scene sweep and the tool self-tests. That is the main guard's run (scripts/main-guard.sh), run on
# demand at one commit and posting nothing itself.
#   all green  the commit gets the `release-gate` status and release.yml is dispatched for it and waited
#              for: it makes the commit the `release` branch, semantic-release tags the next version from
#              there and Pages deploys it; a failed workflow is a release-red issue like a red suite
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
if [ -n "${RELEASE_GUARD:-}" ]; then bash -c "$RELEASE_GUARD" >"$log" 2>&1; else bash scripts/main-guard.sh --sha "$sha" --no-post --no-bisect >"$log" 2>&1; fi
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

# Dispatches release.yml for the commit and waits for its result: 0 published (or the dry run finished), 1 the
# workflow failed, 2 it could not be started or found. The workflow makes the tested commit the `release`
# branch and releases from that, so a main that has moved on does not matter.
run_url=""
dispatch() { # <dry_run: true|false>
  local since id
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  gh workflow run release.yml "${repo[@]}" -f sha="$sha" -f dry_run="$1" || { echo "release: could not dispatch release.yml" >&2; return 2; }
  echo "release: dispatched release.yml for $short (dry run: $1)"
  id=""
  for _ in $(seq 1 24); do
    id="$(gh run list --workflow release.yml "${repo[@]}" --event workflow_dispatch --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$since\")] | sort_by(.createdAt) | .[0].databaseId // empty")"
    [ -n "$id" ] && break
    sleep "${RELEASE_POLL:-5}"
  done
  [ -n "$id" ] || { echo "release: could not find the release.yml run" >&2; return 2; }
  run_url="$(gh run view "$id" "${repo[@]}" --json url --jq .url 2>/dev/null || true)"
  echo "release: waiting for ${run_url:-run $id}"
  gh run watch "$id" "${repo[@]}" --exit-status >/dev/null 2>&1 || return 1
}

# One release-red issue: opened, or commented on when one is open.
report_red() { # <short what> <headline>
  local body open excerpt
  body="$(mktemp "${TMPDIR:-/tmp}/release-issue.XXXXXX")"
  {
    echo "$2"
    echo
    echo "Failing: **$1**${run_url:+ ($run_url)}"
    echo
    # The red steps' own failure lines when the suite printed them, else the end of its output.
    if [ "$verdict" != pass ]; then
      excerpt="$(sed -n '/^--- red steps ---$/,/^--- end red steps ---$/p' "$log" | sed '1d;$d')"
      [ -n "$excerpt" ] || excerpt="$(tail -n 25 "$log")"
      printf '```\n%s\n```\n\n' "$excerpt"
    fi
    echo "Nothing was published. Fix forward or revert, then run \`scripts/release.sh\` again."
  } >"$body"
  if [ $dry = 1 ]; then echo "--- release-red issue (dry run, not opened) ---"; cat "$body"; rm -f "$body"; return 0; fi
  gh label create release-red "${repo[@]}" --color B60205 --description "the release suite failed" 2>/dev/null || true
  open="$(gh issue list "${repo[@]}" --label release-red --state open --json number --jq '.[0].number // empty')"
  if [ -n "$open" ]; then gh issue comment "$open" "${repo[@]}" --body-file "$body" >/dev/null && echo "release: commented on #$open"
  else gh issue create "${repo[@]}" --label release-red --title "release blocked at $short: $1" --body-file "$body" && echo "release: opened a release-red issue"; fi
  rm -f "$body"
}

if [ "$verdict" = pass ]; then
  echo "release: $short passed the whole suite in ${secs}s"
  if [ $dry = 1 ]; then
    echo "release: dry run: would set release-gate and dispatch release.yml for $short"
    dispatch true; rc=$?
    [ $rc -eq 0 ] && echo "release: the workflow's dry run finished (${run_url:-no url}); it names the next version" || echo "release: the workflow's dry run did not finish cleanly (exit $rc)" >&2
    exit $rc
  fi
  gh api "repos/$slug/statuses/$sha" -f state=success -f context=release-gate -f description="The whole suite passed in ${secs}s" >/dev/null \
    || { echo "release: could not set the release-gate status" >&2; exit 2; }
  dispatch false; rc=$?
  if [ $rc -ne 0 ]; then
    [ $rc -eq 1 ] || exit $rc
    echo "release: $short passed the suite but the release workflow failed" >&2
    report_red "the release workflow" "The whole suite passed on \`$short\` ($subject), but the release workflow failed, so nothing was published."
    exit 1
  fi
  echo "release: published from $short"
  # An earlier blocked release is cleared by this one.
  open="$(gh issue list "${repo[@]}" --label release-red --state open --json number --jq '.[0].number // empty')"
  [ -z "$open" ] || gh issue close "$open" "${repo[@]}" --comment "Released from $short: the whole suite passes." >/dev/null
  exit 0
fi

echo "release: $short is NOT released ($verdict: $what)"
report_red "$what" "The release was not cut: the whole suite $([ "$verdict" = unjudged ] && echo "could not be judged" || echo "failed") on \`$short\` ($subject) after ${secs}s."
exit 1
