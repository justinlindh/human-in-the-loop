#!/usr/bin/env bash
# Keeps the published feature media current: on each new origin/main commit it asks
# `npm run feature-media -- --stale` which ids' inputs changed since their last published render,
# re-renders just those (`--only <ids> --publish`, which takes the GPU render lock and publishes to the
# feature-media branch under the same names), and reports a failure the way the main guard does: an open
# issue labelled feature-media-red, commented on while it stays red and closed when a run passes.
# Run by hitl-feature-media.timer. It works in its own clone, so nobody's checkout is touched.
# Usage: scripts/feature-media-auto.sh [--force]   (--force runs for the current main even if already done)
# Env: FM_AUTO_STATE (default ~/.cache/hitl-ci/feature-media-auto), FM_AUTO_ORIGIN (the repo to clone,
#      default this checkout's origin), FM_AUTO_TIMEOUT (seconds for the render, default 3000), GH (a
#      stand-in for tests).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/tmpdir.sh"
STATE="${FM_AUTO_STATE:-$HOME/.cache/hitl-ci/feature-media-auto}"
GH="${GH:-gh}"
force=0; [ "${1:-}" = --force ] && force=1
mkdir -p "$STATE"
exec 7>"$STATE/lock"
flock -n 7 || { echo "feature-media-auto: another run is going"; exit 0; }

origin="${FM_AUTO_ORIGIN:-$(git -C "$HERE/.." remote get-url origin)}"
clone="$STATE/clone"
[ -d "$clone/.git" ] || git clone -q "$origin" "$clone" || { echo "feature-media-auto: clone failed" >&2; exit 1; }
git -C "$clone" fetch -q origin main || { echo "feature-media-auto: fetch failed" >&2; exit 1; }
sha="$(git -C "$clone" rev-parse origin/main)"; short="${sha:0:7}"
if [ "$force" = 0 ] && [ "$(cat "$STATE/last" 2>/dev/null)" = "$sha" ]; then exit 0; fi
git -C "$clone" checkout -q --detach "$sha" || exit 1
log="$STATE/$short.log"
say() { echo "[feature-media-auto $(date +%H:%M:%S)] $*" | tee -a "$log"; }
: >"$log"
cd "$clone" || exit 1
{ npm ls --depth=0 >/dev/null 2>&1 || npm ci --no-audit --no-fund; } >>"$log" 2>&1

own_issues() { "$GH" issue list --state open --label feature-media-red --json number --jq '.[].number' 2>/dev/null; }
report_red() { # <what>
  local body issue; body="$STATE/$short.issue.md"
  { echo "<!-- feature-media-auto -->"; echo "Feature media refresh failed at $short: $1"; echo; echo '```'; tail -n 30 "$log"; echo '```'; } >"$body"
  "$GH" label create feature-media-red --color b60205 --description "the post-merge feature media refresh fails" >/dev/null 2>&1
  issue="$(own_issues | head -n 1)"
  if [ -n "$issue" ]; then "$GH" issue comment "$issue" --body-file "$body" >/dev/null && say "commented on #$issue"
  else "$GH" issue create --title "feature media refresh failed at $short" --label feature-media-red --body-file "$body" >/dev/null && say "opened a feature-media-red issue"; fi
}
report_green() {
  local n
  for n in $(own_issues); do "$GH" issue close "$n" --comment "Green again at $short: the feature media refresh passes." >/dev/null && say "closed #$n"; done
}

# A main without the --stale option yet (it lands in its own PR): nothing to ask, nothing to report, and
# the commit is not recorded, so the next pass looks again.
if ! grep -q -- '--stale' scripts/feature-media/render.mjs 2>/dev/null; then say "feature-media --stale is not on $short yet; skipping"; exit 0; fi
stale="$(npm run -s feature-media -- --stale 2>>"$log")"; rc=$?
if [ $rc -ne 0 ]; then say "--stale failed (exit $rc)"; report_red "--stale exited $rc"; echo "$sha" >"$STATE/last"; exit 1; fi
ids="$(grep -E '^[A-Za-z0-9_.-]+$' <<<"$stale" | paste -sd, -)"
if [ -z "$ids" ]; then say "nothing stale at $short"; report_green; echo "$sha" >"$STATE/last"; exit 0; fi
say "re-rendering: $ids"
t0=$(date +%s)
timeout "${FM_AUTO_TIMEOUT:-3000}" nice -n 10 npm run -s feature-media -- --only "$ids" --publish >>"$log" 2>&1; rc=$?
say "render and publish exit $rc after $(( $(date +%s) - t0 )) s"
echo "$sha" >"$STATE/last"
if [ $rc -eq 0 ]; then report_green; exit 0; fi
report_red "re-render of $ids exited $rc"
exit 1
