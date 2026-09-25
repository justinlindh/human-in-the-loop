#!/usr/bin/env bash
# The main guard: checks the newest commit of origin/main with the full local suite and reports it, so
# a main that goes red (two PRs each green alone, say) is caught at once, not by the next PR.
#   - The gate: local CI (scripts/ci-local.sh from that commit, balance suite forced on, its own sweep
#     left out) and one strict scene sweep. A new sweep violation seen in any mock, moment or props state fails the gate; one seen
#     only in seeded games is a finding, not a failure.
#   - It sets the commit status "main-guard". When main is red it opens, or comments on, one issue
#     labelled main-red with the failing steps; if commits were skipped since the last green one, it
#     bisects them to name the first red merge. The first green commit after closes the issue.
#   - Findings never mark main red and go to their own issues: seed-only sweep violations
#     (sweep-finding, owner art) and timing regressions against the previous main commit
#     (perf-regression), and phone-check failures (phone-regression). Timing and phone-check run at most
#     once an hour and are filed after two bad runs in a row.
# It is built to stay out of the way: one guard at a time, only the newest head (commits merged in
# between are skipped unless a bisect needs them), and it waits while any other job is queued for the
# exclusive software render lock. Each tick it also fast-forwards the shared checkout named by
# HITL_SHARED_CHECKOUT when that is clean, on main, and no ci-pr or local CI runs in it.
# Usage: scripts/main-guard.sh [--sha <commit>] [--no-post] [--loop <seconds>]
#   --sha       check this commit instead of origin/main's tip (checked again even if seen)
#   --no-post   no status, no issues: print the verdict only
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
LOCKS="${HITL_LOCK_DIR:-$HOME/.cache/hitl-ci}"
STATE="$ROOT/main-guard"
PERF_EVERY="${MAIN_GUARD_PERF_EVERY:-3600}"
mkdir -p "$STATE"
exec 7>"$STATE/guard.lock"
flock -n 7 || { echo "main-guard: another guard is running"; exit 0; }

# True when a process whose working directory is $1 runs ci-pr or local CI (found by PID, not by name).
busy_in() {
  local dir="$1" q c a
  for q in /proc/[0-9]*; do
    c="$(readlink "$q/cwd" 2>/dev/null)" || continue
    case "$c" in "$dir"|"$dir"/*) ;; *) continue ;; esac
    a="$(tr '\0' ' ' <"$q/cmdline" 2>/dev/null)" || continue
    case "$a" in *scripts/ci-pr.sh*|*scripts/ci-local.sh*) return 0 ;; esac
  done
  return 1
}
sync_shared() {
  local dir="${HITL_SHARED_CHECKOUT:-}"
  [ -n "$dir" ] && [ -d "$dir/.git" ] || return 0
  [ "$(git -C "$dir" branch --show-current)" = main ] && [ -z "$(git -C "$dir" status --porcelain)" ] || return 0
  busy_in "$dir" && { echo "main-guard: the shared checkout is in use; not updating it"; return 0; }
  git -C "$dir" fetch -q origin main || return 0
  [ -n "$(git -C "$dir" rev-list HEAD..origin/main)" ] || return 0
  git -C "$dir" merge -q --ff-only origin/main && echo "main-guard: shared checkout now at $(git -C "$dir" rev-parse --short HEAD)"
}
# True while any process waits (blocked in flock) for the exclusive software render lock.
someone_waits() {
  local soft; soft="$(readlink -f "$LOCKS/render-checks.lock" 2>/dev/null)" || return 1
  local q f
  for q in /proc/[0-9]*; do
    [ "$(cat "$q/wchan" 2>/dev/null)" = locks_lock_inode_wait ] || continue
    for f in "$q"/fd/*; do [ "$(readlink -f "$f" 2>/dev/null)" = "$soft" ] && return 0; done
  done
  return 1
}
yield() { # waits (up to an hour, or YIELD_MAX seconds) while others queue for the software lock
  local waited=0 max="${YIELD_MAX:-3600}"
  while someone_waits && [ $waited -lt "$max" ]; do sleep 30; waited=$((waited + 30)); done
  [ $waited -gt 0 ] && echo "main-guard: yielded ${waited}s to jobs waiting for the software render lock"
  return 0
}

sync_shared
git -C "$REPO" fetch -q origin main || { echo "main-guard: cannot fetch origin/main" >&2; exit 2; }
sha="$(git -C "$REPO" rev-parse "${sha_arg:-origin/main}")" || exit 2
short="${sha:0:7}"
if [ -z "$sha_arg" ] && [ "$(cat "$STATE/last" 2>/dev/null)" = "$sha" ]; then exit 0; fi

status() { # <state> <description>
  [ $post = 1 ] || return 0
  gh api "repos/{owner}/{repo}/statuses/$sha" -f state="$1" -f context=main-guard -f description="${2:0:140}" >/dev/null 2>&1 \
    || echo "main-guard: could not set the status" >&2
}

# Each run can be replaced for tests (scripts/main-guard.test.sh): MAIN_GUARD_SUITE (writes $SUMMARY),
# MAIN_GUARD_STRICT (writes $OUT/report.json) and MAIN_GUARD_PERF (prints budget lines, exit 1 on a breach).
run() { # <override> <log> <command...>, in the worktree $WT
  local override="$1" log="$2"; shift 2
  if [ -n "$override" ]; then (cd "$WT" && SUMMARY="$summary" OUT="$out" bash -c "$override") >"$log" 2>&1
  else (cd "$WT" && "$@") >"$log" 2>&1; fi
}

# gate <commit>: runs the gate there. Sets ci_rc, gate_new (new sweep violations outside seeded games)
# and seed_new (new ones only in seeded games), with the summary and logs under $STATE.
gate() {
  local c="$1" cs="${1:0:7}"
  WT="$ROOT/main-guard-$cs-$$"
  # A failed checkout (a full disk, a git lock) says nothing about the commit: retry once, then set
  # gate_err so no caller counts it as red. So does local CI failing only on the machine (exit 3).
  gate_err=0
  if ! git -C "$REPO" worktree add -q --detach "$WT" "$c"; then
    rm -rf "$WT"; git -C "$REPO" worktree prune
    sleep "${MAIN_GUARD_RETRY_WAIT:-30}"
    if ! git -C "$REPO" worktree add -q --detach "$WT" "$c"; then
      rm -rf "$WT"; git -C "$REPO" worktree prune
      WT=""; gate_err=1; ci_rc=0; gate_new=0; seed_new=0; return
    fi
  fi
  if cmp -s "$REPO/package-lock.json" "$WT/package-lock.json" && [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] \
    && (cd "$REPO" && npm ls --depth=0 >/dev/null 2>&1); then
    ln -s "$REPO/node_modules" "$WT/node_modules"
  fi
  summary="$STATE/$cs.md"; out="$STATE/strict-$cs"; mkdir -p "$out"
  yield
  run "${MAIN_GUARD_SUITE:-}" "$STATE/$cs.log" env CI_FULL=1 CI_SKIP_SWEEP=1 CI_DIR="$WT" bash "$WT/scripts/ci-local.sh" --base "$c^1" --summary "$summary"
  ci_rc=$?
  [ "$ci_rc" -eq 3 ] && { gate_err=1; ci_rc=0; }
  run "${MAIN_GUARD_STRICT:-}" "$STATE/$cs.strict.log" timeout 1800 nice -n 10 node blender/checks/sweep.mjs --gpu --strict --out "$out"
  local counts
  counts="$(node -e '
    const fs = require("fs"); let r;
    try { r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { console.log("-1 0"); process.exit(0); }
    const states = (v) => v.states ?? [v.state];
    const seedOnly = (v) => states(v).every((s) => String(s).startsWith("seed:"));
    const fresh = (r.violations ?? []).filter((v) => v.status === "new");
    const lines = (list) => list.map((v) => `${v.key} (${states(v).join(", ")})`).join("\n");
    fs.writeFileSync(process.argv[2], lines(fresh.filter((v) => !seedOnly(v))));
    fs.writeFileSync(process.argv[3], lines(fresh.filter(seedOnly)));
    console.log(`${fresh.filter((v) => !seedOnly(v)).length} ${fresh.filter(seedOnly).length}`);
  ' "$out/report.json" "$STATE/$cs.gate-new.txt" "$STATE/$cs.seed-new.txt")"
  gate_new="${counts% *}"; seed_new="${counts#* }"
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
  WT=""
}
red_steps() { # <short>: the failing parts of the gate just run
  local cs="$1" parts=()
  [ "$ci_rc" -eq 0 ] || parts+=("$(grep -E '\| (FAIL|error)' "$STATE/$cs.md" 2>/dev/null | cut -d'|' -f2 | tr -d ' ' | paste -sd, - | sed 's/^$/local-ci/')")
  [ "$gate_new" = 0 ] || parts+=("sweep")
  local IFS=', '; echo "${parts[*]}"
}

WT=""
trap '[ -n "$WT" ] && git -C "$REPO" worktree remove --force "$WT" 2>/dev/null' EXIT
trap 'exit 143' TERM INT HUP
echo "main-guard: checking $short $(git -C "$REPO" log -1 --format=%s "$sha" | cut -c1-80)"
status pending "Main guard running"
t0=$(date +%s)
gate "$sha"
if [ "$gate_err" = 1 ]; then
  echo "main-guard: could not judge $short (a failed checkout, or local CI failing only on the machine); no verdict"
  status error "Main guard could not judge this commit: a machine failure, not the code"
  exit 2
fi
what="$(red_steps "$short")"
secs=$(( $(date +%s) - t0 ))
echo "$sha" >"$STATE/last"

# One open issue per kind of finding: opened, commented on when the findings change, closed when clean.
finding() { # <label> <description> <title> <failed: 0|1> <body file>
  local label="$1" desc="$2" title="$3" failed="$4" bodyf="$5"
  [ $post = 1 ] || return 0
  local open; open="$(gh issue list --state open --label "$label" --json number --jq '.[0].number // ""')"
  if [ "$failed" = 0 ]; then
    [ -n "$open" ] && gh issue close "$open" --comment "Clean at $short." >/dev/null && echo "main-guard: closed #$open ($label)"
    rm -f "$STATE/$label.last"; return 0
  fi
  local print; print="$(md5sum <"$bodyf" | cut -c1-12)"
  [ -n "$open" ] && [ "$(cat "$STATE/$label.last" 2>/dev/null)" = "$print" ] && return 0
  local body; body="$(mktemp)"
  { echo "Main guard, \`$short\`: $title."; echo; echo '```'; cat "$bodyf"; echo '```'; } >"$body"
  gh label create "$label" --color fbca04 --description "$desc" >/dev/null 2>&1
  if [ -n "$open" ]; then gh issue comment "$open" --body-file "$body" >/dev/null && echo "main-guard: updated #$open ($label)"
  else gh issue create --title "$title at $short" --label "$label" --body-file "$body" >/dev/null && echo "main-guard: opened a $label issue"; fi
  echo "$print" >"$STATE/$label.last"; rm -f "$body"
}
if [ "$gate_new" = 0 ]; then
  finding sweep-finding "Scene sweep findings from the main guard (owner: art)" "new scene sweep violations seen only in seeded games" \
    "$([ "$seed_new" = 0 ] && echo 0 || echo 1)" "$STATE/$short.seed-new.txt"
fi

# Timing against the previous main commit, and phone-check: at most once per PERF_EVERY seconds, each
# filed after two bad runs in a row. perf's bench pins and nices itself, so it runs under timeout only.
now=$(date +%s)
if [ $(( now - $(cat "$STATE/perf-at" 2>/dev/null || echo 0) )) -ge "$PERF_EVERY" ] \
  && { [ -n "${MAIN_GUARD_PERF:-}" ] || git -C "$REPO" cat-file -e "$sha:scripts/perf/bench.js" 2>/dev/null; }; then
  echo "$now" >"$STATE/perf-at"
  yield
  WT="$ROOT/main-guard-perf-$short-$$"
  if git -C "$REPO" worktree add -q --detach "$WT" "$sha"; then
    [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] && ln -s "$REPO/node_modules" "$WT/node_modules"
    summary=""; out=""
    run "${MAIN_GUARD_PERF:-}" "$STATE/$short.perf.log" bash -c "timeout 1200 node scripts/perf/bench.js --software --cores 2 --quality low --scenes garage,floor --runs 3 --seconds 5 --refs '$sha^1,$sha' --json '$STATE/$short.perf.json' > '$STATE/$short.perf.txt' 2>&1; node scripts/perf/budget.js '$STATE/$short.perf.json'"
    perf_rc=$?
    # Phone and tablet playability on the same cadence, so a touch regression from a change the PR
    # path filter doesn't catch (render, sim) is found within the hour.
    phone_rc=0
    if [ -n "${MAIN_GUARD_PHONE:-}" ] || [ -f "$WT/scripts/phone-check.js" ]; then
      run "${MAIN_GUARD_PHONE:-}" "$STATE/$short.phone.log" timeout 900 node scripts/phone-check.js --out "$STATE/phone-$short"
      phone_rc=$?
    fi
    git -C "$REPO" worktree remove --force "$WT" 2>/dev/null; WT=""
    if [ $phone_rc -eq 0 ]; then pstreak=0; else pstreak=$(( $(cat "$STATE/phone-streak" 2>/dev/null || echo 0) + 1 )); fi
    echo "$pstreak" >"$STATE/phone-streak"
    echo "main-guard: phone-check $([ $phone_rc -eq 0 ] && echo passes || echo "fails, $pstreak run(s) in a row")"
    phone_body="$STATE/$short.phone.issue"
    { grep -E 'FAIL|Error|error' "$STATE/$short.phone.log"; tail -n 3 "$STATE/$short.phone.log"; } 2>/dev/null >"$phone_body"
    if [ $phone_rc -eq 0 ]; then finding phone-regression "Phone and tablet playability failures found by the main guard" "phone-check fails on main" 0 "$phone_body"
    elif [ "$pstreak" -ge 2 ]; then finding phone-regression "Phone and tablet playability failures found by the main guard" "phone-check fails on main, in $pstreak runs in a row" 1 "$phone_body"; fi
    if [ $perf_rc -eq 0 ]; then streak=0; else streak=$(( $(cat "$STATE/perf-streak" 2>/dev/null || echo 0) + 1 )); fi
    echo "$streak" >"$STATE/perf-streak"
    echo "main-guard: timing $([ $perf_rc -eq 0 ] && echo "within budget" || echo "over budget, $streak run(s) in a row")"
    perf_body="$STATE/$short.perf.issue"
    { grep -E 'FAIL|x[0-9]' "$STATE/$short.perf.log"; echo; head -n 1 "$STATE/$short.perf.txt" 2>/dev/null; grep -E 'render' "$STATE/$short.perf.txt" 2>/dev/null; } >"$perf_body"
    if [ $perf_rc -eq 0 ]; then finding perf-regression "Timing regressions found by the main guard" "a timing regression against the previous main commit" 0 "$perf_body"
    elif [ "$streak" -ge 2 ]; then finding perf-regression "Timing regressions found by the main guard" "a timing regression against the previous main commit, in $streak runs in a row" 1 "$perf_body"; fi
  fi
fi

if [ -z "$what" ]; then
  echo "main-guard: $short PASS in ${secs}s"
  echo "$sha" >"$STATE/last-green"
  status success "Full suite and sweep pass (${secs}s)"
  if [ $post = 1 ]; then
    for n in $(gh issue list --state open --label main-red --json number --jq '.[].number'); do
      gh issue close "$n" --comment "Green again at $short: the full suite and the sweep pass." >/dev/null
    done
  fi
  exit 0
fi

echo "main-guard: $short FAIL ($what) in ${secs}s"
status failure "Red: $what"
# Report first, so a run stopped later (by the service's time limit, say) cannot lose it: the next
# tick sees this commit as checked.
issue=""
if [ $post = 1 ]; then
  body="$(mktemp)"
  {
    echo "Main guard: \`$short\` ($(git -C "$REPO" log -1 --format=%s "$sha")) is red: **$what**."
    echo
    [ -s "$STATE/$short.md" ] && { cat "$STATE/$short.md"; echo; }
    if [ "$gate_new" != 0 ]; then
      echo "New sweep violations outside seeded games:"; echo; echo '```'; cat "$STATE/$short.gate-new.txt"; echo '```'
    fi
    if [ "$ci_rc" -ne 0 ]; then
      echo; echo "Local CI, last lines:"; echo; echo '```'; tail -n 25 "$STATE/$short.log"; echo '```'
    fi
  } >"$body"
  gh label create main-red --color b60205 --description "main fails the main guard" >/dev/null 2>&1
  issue="$(gh issue list --state open --label main-red --json number --jq '.[0].number // ""')"
  if [ -n "$issue" ]; then
    gh issue comment "$issue" --body-file "$body" >/dev/null && echo "main-guard: commented on #$issue"
  else
    url="$(gh issue create --title "main is red at $short: $what" --label main-red --body-file "$body")" && echo "main-guard: opened $url"
    issue="${url##*/}"
  fi
  rm -f "$body"
fi

# Merges since the last green commit were skipped: bisect them to name the first red one, within
# MAIN_GUARD_BISECT_BUDGET seconds (waits for the lock included); past it, report the range narrowed so far.
green="$(cat "$STATE/last-green" 2>/dev/null)"
[ -n "$green" ] && git -C "$REPO" merge-base --is-ancestor "$green" "$sha" 2>/dev/null || exit 1
mapfile -t range < <(git -C "$REPO" rev-list --first-parent --reverse "$green..$sha")
lo=0; hi=$(( ${#range[@]} - 1 ))
[ "$hi" -gt 0 ] || exit 1
deadline=$(( $(date +%s) + ${MAIN_GUARD_BISECT_BUDGET:-2400} ))
echo "main-guard: bisecting ${#range[@]} merges since the last green ${green:0:7}"
while [ $lo -lt $hi ] && [ "$(date +%s)" -lt "$deadline" ]; do
  mid=$(( (lo + hi) / 2 ))
  YIELD_MAX=$(( deadline - $(date +%s) )) gate "${range[$mid]}"
  [ "$gate_err" = 1 ] && { stopped="${range[$mid]:0:7}"; break; }
  if [ -z "$(red_steps "${range[$mid]:0:7}")" ]; then lo=$((mid + 1)); else hi=$mid; fi
done
subject() { git -C "$REPO" log -1 --format=%s "$1"; }
if [ $lo -eq $hi ]; then
  note="First red merge since the last green \`${green:0:7}\`: \`${range[$lo]:0:7}\` ($(subject "${range[$lo]}"))."
  echo "main-guard: first red merge ${range[$lo]:0:7}"
else
  why="ran out of time"; [ -n "${stopped:-}" ] && why="could not judge \`$stopped\` (a machine failure)"
  note="The bisect $why: the first red merge is between \`${range[$lo]:0:7}\` ($(subject "${range[$lo]}")) and \`${range[$hi]:0:7}\` ($(subject "${range[$hi]}"))."
  echo "main-guard: bisect stopped at ${range[$lo]:0:7}..${range[$hi]:0:7}"
fi
[ -n "$issue" ] && gh issue comment "$issue" --body "$note" >/dev/null
exit 1
