#!/usr/bin/env bash
# The main guard: runs the full local suite on each new commit of origin/main and reports it, so a
# main that goes red (two PRs each green alone, say) is caught at once, not by the next PR to merge it.
#   - local CI (scripts/ci-local.sh from that commit) with the balance suite forced on (CI_FULL=1);
#   - the scene sweep in fast mode (findings seen only in seeded games are advisory).
# It sets the commit status "main-guard" on the commit. When main is red it opens, or comments on,
# one issue labelled main-red with the failing steps; the first green commit after closes it.
# Findings that never mark main red go to their own issues: the strict sweep's seed-only findings
# (sweep-finding) and timing regressions against the previous main commit (perf-regression).
# One guard runs at a time; a commit already checked is skipped.
# Usage: scripts/main-guard.sh [--sha <commit>] [--no-post] [--loop <seconds>]
#   --sha       check this commit instead of the tip of origin/main (checked again even if seen)
#   --no-post   no status, no issue: print the verdict only
#   --loop      check, sleep, and check again forever (for running it by hand)
set -uo pipefail
usage="usage: scripts/main-guard.sh [--sha <commit>] [--no-post] [--loop <seconds>]"
sha_arg=""; post=1; loop=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) sha_arg="${2:?$usage}"; shift 2 ;;
    --no-post) post=0; shift ;;
    --loop) loop="${2:?$usage}"; shift 2 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
if [ -n "$loop" ]; then
  while :; do bash "$0" ${sha_arg:+--sha "$sha_arg"} $([ $post = 0 ] && echo --no-post); sleep "$loop"; done
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}"
STATE="$ROOT/main-guard"
mkdir -p "$STATE"
exec 7>"$STATE/guard.lock"
flock -n 7 || { echo "main-guard: another guard is running"; exit 0; }

git -C "$REPO" fetch -q origin main || { echo "main-guard: cannot fetch origin/main" >&2; exit 2; }
sha="$(git -C "$REPO" rev-parse "${sha_arg:-origin/main}")" || exit 2
short="${sha:0:7}"
if [ -z "$sha_arg" ] && [ "$(cat "$STATE/last" 2>/dev/null)" = "$sha" ]; then exit 0; fi

status() { # <state> <description>
  [ $post = 1 ] || return 0
  gh api "repos/{owner}/{repo}/statuses/$sha" -f state="$1" -f context=main-guard -f description="${2:0:140}" >/dev/null 2>&1 \
    || echo "main-guard: could not set the status" >&2
}

WT="$ROOT/main-guard-$short-$$"
git -C "$REPO" worktree add -q --detach "$WT" "$sha" || exit 2
trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null' EXIT
trap 'exit 143' TERM INT HUP
# Share the checkout's install when the lockfile matches and it is complete; otherwise ci-local
# installs clean.
if cmp -s "$REPO/package-lock.json" "$WT/package-lock.json" && [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] \
  && (cd "$REPO" && npm ls --depth=0 >/dev/null 2>&1); then
  ln -s "$REPO/node_modules" "$WT/node_modules"
fi
echo "main-guard: checking $short $(git -C "$REPO" log -1 --format=%s "$sha" | cut -c1-80)"
status pending "Main guard running"

t0=$(date +%s)
summary="$STATE/$short.md"
# Each run can be replaced for tests (scripts/main-guard.test.sh): MAIN_GUARD_SUITE, MAIN_GUARD_SWEEP,
# MAIN_GUARD_STRICT, MAIN_GUARD_PERF.
run() { # <override> <log> <command...>
  local override="$1" log="$2"; shift 2
  if [ -n "$override" ]; then (cd "$WT" && SUMMARY="$summary" bash -c "$override") >"$log" 2>&1
  else (cd "$WT" && "$@") >"$log" 2>&1; fi
}
# The gate: local CI, and the sweep in fast mode, where findings seen only in seeded games are advisory.
run "${MAIN_GUARD_SUITE:-}" "$STATE/$short.log" env CI_FULL=1 CI_DIR="$WT" bash "$WT/scripts/ci-local.sh" --base "$sha^1" --summary "$summary"
ci_rc=$?
run "${MAIN_GUARD_SWEEP:-}" "$STATE/$short.sweep.log" timeout 1800 nice -n 10 node blender/checks/sweep.mjs --gpu --out "$STATE/sweep-$short"
sweep_rc=$?
# Findings, which never mark main red: the strict sweep (seed-only findings count too) and the
# timing comparison with the previous main commit, both filed as issues for their owners.
run "${MAIN_GUARD_STRICT:-}" "$STATE/$short.strict.log" timeout 1800 nice -n 10 node blender/checks/sweep.mjs --gpu --strict --out "$STATE/strict-$short"
strict_rc=$?
perf_rc=0
if [ -n "${MAIN_GUARD_PERF:-}" ] || [ -f "$WT/scripts/perf/bench.js" ]; then
  run "${MAIN_GUARD_PERF:-}" "$STATE/$short.perf.log" bash -c "timeout 1800 node scripts/perf/bench.js --software --cores 2 --quality low --scenes garage,floor --runs 3 --refs $sha^1,$sha --json $STATE/$short.perf.json && node scripts/perf/budget.js $STATE/$short.perf.json"
  perf_rc=$?
fi
secs=$(( $(date +%s) - t0 ))

failed=()
[ $ci_rc -eq 0 ] || failed+=("$(grep -E '\| (FAIL|error)' "$summary" 2>/dev/null | cut -d'|' -f2 | tr -d ' ' | paste -sd, - || echo local-ci)")
[ $sweep_rc -eq 0 ] || failed+=("sweep")
echo "$sha" >"$STATE/last"

# One open issue per kind of finding: opened, commented on when the findings change, closed when clean.
finding() { # <label> <description> <title> <rc> <log> <fingerprint regex>
  local label="$1" desc="$2" title="$3" rc="$4" log="$5" re="$6"
  [ $post = 1 ] || return 0
  local open; open="$(gh issue list --state open --label "$label" --json number --jq '.[0].number // ""')"
  if [ "$rc" -eq 0 ]; then
    [ -n "$open" ] && gh issue close "$open" --comment "Clean at $short." >/dev/null && echo "main-guard: closed #$open ($label)"
    rm -f "$STATE/$label.last"; return 0
  fi
  local print; print="$(grep -E "$re" "$log" | sort | md5sum | cut -c1-12)"
  [ -n "$open" ] && [ "$(cat "$STATE/$label.last" 2>/dev/null)" = "$print" ] && return 0
  local body; body="$(mktemp)"
  { echo "Main guard, \`$short\`: $title"; echo; echo '```'; tail -n 30 "$log"; echo '```'; } >"$body"
  gh label create "$label" --color fbca04 --description "$desc" >/dev/null 2>&1
  if [ -n "$open" ]; then gh issue comment "$open" --body-file "$body" >/dev/null && echo "main-guard: updated #$open ($label)"
  else gh issue create --title "$title at $short" --label "$label" --body-file "$body" >/dev/null && echo "main-guard: opened a $label issue"; fi
  echo "$print" >"$STATE/$label.last"; rm -f "$body"
}
if [ $sweep_rc -eq 0 ]; then
  finding sweep-finding "Scene sweep findings from the main guard (owner: art)" "new scene sweep findings in seeded games" "$strict_rc" "$STATE/$short.strict.log" 'NEW|new'
fi
finding perf-regression "Timing regressions found by the main guard" "a timing regression against the previous main commit" "$perf_rc" "$STATE/$short.perf.log" '>|x[0-9]|budget|ratio'

if [ ${#failed[@]} -eq 0 ]; then
  echo "main-guard: $short PASS in ${secs}s"
  status success "Full suite and sweep pass (${secs}s)"
  if [ $post = 1 ]; then
    for n in $(gh issue list --state open --label main-red --json number --jq '.[].number'); do
      gh issue close "$n" --comment "Green again at $short: the full suite and the sweep pass." >/dev/null
    done
  fi
  exit 0
fi

what="$(IFS=', '; echo "${failed[*]}")"
echo "main-guard: $short FAIL ($what) in ${secs}s"
status failure "Red: $what"
[ $post = 1 ] || exit 1
body="$(mktemp)"
{
  echo "Main guard: \`$short\` ($(git -C "$REPO" log -1 --format=%s "$sha")) is red: **$what**."
  echo
  [ -s "$summary" ] && { cat "$summary"; echo; }
  if [ $sweep_rc -ne 0 ]; then
    echo "Sweep:"; echo; echo '```'; tail -n 15 "$STATE/$short.sweep.log"; echo '```'
  fi
  if [ $ci_rc -ne 0 ]; then
    echo; echo "Local CI, last lines:"; echo; echo '```'; tail -n 25 "$STATE/$short.log"; echo '```'
  fi
} >"$body"
gh label create main-red --color b60205 --description "main fails the main guard" >/dev/null 2>&1
open_issue="$(gh issue list --state open --label main-red --json number --jq '.[0].number // ""')"
if [ -n "$open_issue" ]; then
  gh issue comment "$open_issue" --body-file "$body" >/dev/null && echo "main-guard: commented on #$open_issue"
else
  url="$(gh issue create --title "main is red at $short: $what" --label main-red --body-file "$body")" && echo "main-guard: opened $url"
fi
rm -f "$body"
exit 1
