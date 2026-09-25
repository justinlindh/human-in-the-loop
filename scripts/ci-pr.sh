#!/usr/bin/env bash
# Local CI for a pull request, posted to the PR as the merge gate. Tests the PR merged into its base
# (GitHub's merge ref) when there is one, else the PR head, in a throwaway worktree.
# Besides the comment it sets the commit status "local-ci" on the PR head (pending while it runs,
# then success or failure), which branch protection can require.
# Usage: scripts/ci-pr.sh <pr-number> [--no-comment] [--head <sha>] [--allow-bot]
#   --no-comment  no comment and no status (a local check)
#   --head        the head to test, such as the commit just pushed: waits until GitHub reports it
#   --allow-bot   run a Dependabot PR (see scripts/ci-bot-check.sh for what qualifies), and only once
#                 its head has a review pass: the reviewer runs it after reading the changelog and the
#                 lockfile diff, since local CI executes the new packages' install scripts
# To stop a run, signal its process group: kill -TERM -<pgid> (the pgid is printed at start). The
# run then stops its local CI, removes its worktree and sets local-ci to error.
# Everything it runs besides this script comes from freshly fetched origin/<base>, never from the
# checkout it was started in: the trust list, helper scripts and local CI itself come from a worktree
# of the base, and local CI runs on the tree under test (the PR merged into that base). A PR that
# changes local CI is also run through its own version. A clean checkout on the base
# branch that is behind updates itself first and starts again.
set -uo pipefail

usage="usage: scripts/ci-pr.sh <pr-number> [--no-comment] [--head <sha>] [--allow-bot]"
pr="${1:?$usage}"; shift
orig_args=("$@")
comment=1; want=""; allow_bot=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-comment) comment=0; shift ;;
    --head) want="${2:?$usage}"; shift 2 ;;
    --allow-bot) allow_bot=1; shift ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}"
# The run and every step of it go to the team's timing log, tagged with the PR.
source "$(dirname "$0")/lib/timing.sh" 2>/dev/null || timing_log() { :; }
export HITL_PR="$pr"

# A clean checkout on main that is behind origin/main fast-forwards and runs the new copy of this
# script. git replaces files rather than rewriting them, so runs already going keep their own copy.
if [ -z "${CI_PR_UPDATED:-}" ] && [ "$(git -C "$REPO" branch --show-current)" = main ] \
  && [ -z "$(git -C "$REPO" status --porcelain)" ] && git -C "$REPO" fetch -q origin main \
  && [ -n "$(git -C "$REPO" rev-list HEAD..origin/main)" ]; then
  if git -C "$REPO" merge -q --ff-only origin/main; then
    echo "ci-pr: updated this checkout to $(git -C "$REPO" rev-parse --short HEAD); starting again"
    CI_PR_UPDATED=1 exec bash "$REPO/scripts/ci-pr.sh" "$pr" "${orig_args[@]}"
  fi
fi

# Local CI runs the PR's code on this machine (npm install scripts, tests, a dev server, a browser),
# so it only runs PRs from a branch of this repository by an author listed in scripts/ci-trusted.
# Nothing is fetched, checked out or posted for any other PR.
TRUSTED="${CI_TRUSTED_FILE:-}"
pr_trusted() { # <isCrossRepository> <head repo owner> <author> <repo owner>
  [ "$1" = false ] || { echo "ci-pr: #$pr comes from a fork ($2); not running it" >&2; return 1; }
  [ "$2" = "$4" ] || { echo "ci-pr: #$pr head repository belongs to $2, not $4; not running it" >&2; return 1; }
  grep -qxF -- "$3" <(tr -d '\r' <"$TRUSTED" 2>/dev/null | sed -e 's/#.*//' -e 's/[[:blank:]]//g' | grep -v '^$') \
    || { echo "ci-pr: #$pr is by $3, who is not in scripts/ci-trusted; not running it" >&2; return 1; }
}
# Fields are split on the unit separator, which read never merges: an empty field stays empty
# instead of shifting the next one (such as the branch name) into its place.
pr_fields="$(gh pr view "$pr" --json isCrossRepository,headRepositoryOwner,author,headRefName,baseRefName \
  --jq '[.isCrossRepository, (.headRepositoryOwner.login // ""), (.author.login // ""), .headRefName, .baseRefName] | map(tostring) | join("\u001f")')"
IFS=$'\037' read -r cross owner author branch pr_base <<<"$pr_fields"
pr_base="${pr_base:-main}"
# The trust list is the base branch's, freshly fetched: not this checkout's, which may be old.
trusted_tmp=""
if [ -z "$TRUSTED" ]; then
  trusted_tmp="$(mktemp)"; TRUSTED="$trusted_tmp"
  git -C "$REPO" fetch -q origin "$pr_base" 2>/dev/null
  git -C "$REPO" show "origin/$pr_base:scripts/ci-trusted" >"$trusted_tmp" 2>/dev/null
fi
repo_owner="$(gh repo view --json owner --jq .owner.login)"
[ -n "${cross:-}" ] && [ -n "$repo_owner" ] || { echo "ci-pr: cannot read PR #$pr" >&2; exit 2; }
if [ "$allow_bot" = 1 ]; then
  # gh reports app authors as app/<name>; the REST login (dependabot[bot]) cannot belong to a person.
  IFS=$'\037' read -r bot_login bot_type < <(gh api "repos/{owner}/{repo}/pulls/$pr" --jq '[.user.login, .user.type] | join("\u001f")')
  [ "${bot_login:-}" = 'dependabot[bot]' ] && [ "${bot_type:-}" = Bot ] \
    || { echo "ci-pr: --allow-bot is only for Dependabot PRs; #$pr is by ${bot_login:-unknown}" >&2; exit 2; }
else
  pr_trusted "$cross" "$owner" "$author" "$repo_owner" || { rm -f "$trusted_tmp"; exit 2; }
fi
rm -f "$trusted_tmp"
mkdir -p "$ROOT"
# One run per PR at a time, each in its own worktree: overlapping runs sharing a path deleted
# each other's trees mid-run.
exec 9>"$ROOT/pr-$pr.lock"
flock -n 9 || { echo "ci-pr: another run for #$pr is in progress; not starting a second one" >&2; exit 3; }
echo "ci-pr: #$pr run $$, process group $(ps -o pgid= -p $$ | tr -d ' '); stop it with kill -TERM -<that group>"
WT="$ROOT/pr-$pr-$$"
TOOLS="$ROOT/tools-$pr-$$"

read_pr() { read -r head base title < <(gh pr view "$pr" --json headRefOid,baseRefName,title --jq '[.headRefOid, .baseRefName, .title] | @tsv' | tr '\t' '\037' | awk -F'\037' '{ printf "%s %s %s\n", $1, $2, $3 }'); }
read_pr
[ -n "$head" ] || { echo "ci-pr: cannot read PR #$pr" >&2; exit 2; }
# Right after a push GitHub can still report the previous head for a while.
if [ -n "$want" ]; then
  for _ in $(seq 1 24); do case "$head" in "$want"*) break ;; esac; sleep 5; read_pr; done
  case "$head" in "$want"*) ;; *) echo "ci-pr: GitHub still reports head ${head:0:7} for #$pr, not $want; try again shortly" >&2; exit 2 ;; esac
fi

# Commit status "local-ci" on the PR head: status <state> <description> [target url].
status_final=0
status() {
  [ "$comment" = 1 ] || return 0
  gh api "repos/{owner}/{repo}/statuses/$head" -f state="$1" -f context=local-ci -f description="$2" \
    ${3:+-f target_url="$3"} >/dev/null 2>&1 || echo "ci-pr: could not set the local-ci status" >&2
}

git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/ci/pr-$pr/head"
# This script is the one piece taken from the checkout it runs in. If it differs from the base
# branch's copy (a checkout that cannot update itself), a posting run refuses; a local check warns.
if ! git -C "$REPO" diff --quiet HEAD "origin/$base" -- scripts/ci-pr.sh; then
  msg="ci-pr: this checkout's scripts/ci-pr.sh differs from origin/$base; update it with git pull --ff-only, or run from a checkout of origin/$base"
  if [ "$comment" = 1 ]; then echo "$msg; not running it" >&2; exit 2; fi
  echo "$msg (a local check, so running anyway)" >&2
fi
[ "$(git -C "$REPO" rev-parse "refs/ci/pr-$pr/head")" = "$head" ] \
  || { echo "ci-pr: refs/pull/$pr/head is not yet $head; try again shortly" >&2; exit 2; }
# The head must also be the tip of the PR's branch in this repository, not only a pull ref.
[ "$(git -C "$REPO" ls-remote origin "refs/heads/$branch" | cut -f1)" = "$head" ] \
  || { echo "ci-pr: ${head:0:7} is not the tip of $branch in this repository; not running it" >&2; exit 2; }
# The author's local branch (worktrees on this machine share refs) must not hold commits the PR
# lacks: that means work not pushed yet, and the run would test something else.
if local_tip="$(git -C "$REPO" rev-parse -q --verify "refs/heads/$branch")" && [ "$local_tip" != "$head" ] \
  && ! git -C "$REPO" merge-base --is-ancestor "$local_tip" "$head"; then
  unpushed="$(git -C "$REPO" rev-list --count "$head..$local_tip")"
  msg="ci-pr: local branch $branch is at ${local_tip:0:7}, with $unpushed commit(s) the PR head ${head:0:7} lacks; push them first"
  if [ "$comment" = 1 ]; then echo "$msg; not running it" >&2; exit 2; fi
  echo "$msg (a local check, so running anyway)" >&2
fi
# Helper scripts (commit check, Dependabot check, review carry) come from a worktree of the base.
git -C "$REPO" worktree add -q --detach "$TOOLS" "origin/$base" || { echo "ci-pr: cannot check out origin/$base" >&2; exit 2; }
trap 'git -C "$REPO" worktree remove --force "$TOOLS" 2>/dev/null' EXIT
if [ "$allow_bot" = 1 ]; then
  bot_mb="$(git -C "$REPO" merge-base "origin/$base" "$head")" || { echo "ci-pr: no merge base for #$pr" >&2; exit 2; }
  bot_tmp="$(mktemp -d)"
  git -C "$REPO" diff --name-only --no-renames "$bot_mb" "$head" >"$bot_tmp/paths"
  git -C "$REPO" log --no-merges --format='%ae' "$bot_mb..$head" >"$bot_tmp/authors"
  bash "$TOOLS/scripts/ci-bot-check.sh" "$bot_login" "$bot_type" "$cross" "$owner" "$repo_owner" "$bot_tmp/paths" "$bot_tmp/authors"
  bot_rc=$?; rm -rf "$bot_tmp"
  [ $bot_rc -eq 0 ] || exit 2
  review_state="$(gh api "repos/{owner}/{repo}/commits/$head/status" --jq '[.statuses[] | select(.context == "review")][0].state // ""')"
  [ "$review_state" = success ] \
    || { echo "ci-pr: #$pr head ${head:0:7} has no review pass (review: ${review_state:-none}); review it first" >&2; exit 2; }
fi
git -C "$REPO" worktree prune
ci_pid=""
cleanup() {
  # Local CI runs in its own process group; stop all of it (tests, browsers, dev servers) too.
  [ -n "$ci_pid" ] && kill -- "-$ci_pid" 2>/dev/null
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
  git -C "$REPO" worktree remove --force "$TOOLS" 2>/dev/null
  # A run that stops before its verdict must not leave the status pending forever.
  [ "$status_final" = 1 ] || status error "Local CI stopped before finishing; run scripts/ci-pr.sh $pr again"
}
trap cleanup EXIT
# A stop signal ends the run through the EXIT trap instead of skipping it.
trap 'exit 143' TERM INT HUP
status pending "Local CI running"

# Changes that cannot affect the game (scripts/ci-skip-paths) get a light gate: the commit check and a
# syntax check of touched .js and .mjs. The list and the classifier come from the base branch, never
# from the PR, so a PR cannot make itself light.
mb="$(git -C "$REPO" merge-base "origin/$base" "refs/ci/pr-$pr/head")"
# --no-renames: a moved file lists its old path too, so moving game code into docs/ is not light.
changed="$(git -C "$REPO" diff --name-only --no-renames "$mb" "refs/ci/pr-$pr/head")"
skip_list="$(mktemp)"; classify="$(mktemp)"
git -C "$REPO" show "origin/$base:scripts/ci-skip-paths" >"$skip_list" 2>/dev/null || rm -f "$skip_list"
if git -C "$REPO" show "origin/$base:scripts/ci-classify.sh" >"$classify" 2>/dev/null; then
  mode="$(printf '%s\n' "$changed" | bash "$classify" "$skip_list")"
else
  mode=full
fi
rm -f "$skip_list" "$classify"
echo "ci-pr: #$pr gets the $mode gate"
if [ "$mode" = light ]; then
  t0=$(date +%s); light_ok=1; table="| step | result |"$'\n'"|---|---|"
  if "$TOOLS/scripts/check-commits.sh" "$mb" "refs/ci/pr-$pr/head" "$title" >/dev/null 2>&1; then table+=$'\n'"| commits | pass |"
  else table+=$'\n'"| commits | FAIL |"; light_ok=0; fi
  syntax=pass
  while IFS= read -r f; do
    case "$f" in *.js|*.mjs) ;; *) continue ;; esac
    tmp="$(mktemp --suffix=".${f##*.}")"
    git -C "$REPO" show "refs/ci/pr-$pr/head:$f" >"$tmp" 2>/dev/null && { node --check "$tmp" >/dev/null 2>&1 || syntax=FAIL; }
    rm -f "$tmp"
  done <<<"$changed"
  [ "$syntax" = pass ] || light_ok=0
  table+=$'\n'"| syntax (touched .js/.mjs) | $syntax |"$'\n'"| tests, build, lifecycle, soak, render checks, balance | skipped: docs-only change |"
  secs=$(( $(date +%s) - t0 )); verdict=$([ $light_ok = 1 ] && echo PASS || echo FAIL)
  body="$(mktemp)"
  { echo "### Local CI: $verdict (light)"; echo; echo "Head \`${head:0:7}\`: every changed file is on scripts/ci-skip-paths, in ${secs}s."; echo; echo "$table"; } >"$body"
  cat "$body"
  url=""; [ "$comment" = 1 ] && url="$(gh pr comment "$pr" --body-file "$body")" && echo "ci-pr: posted to #$pr"
  if [ $light_ok = 1 ]; then status success "skipped: docs-only change (commits and syntax checked)" "$url"
  else status failure "Local CI $verdict (light): commits or syntax" "$url"; fi
  status_final=1; rm -f "$body"
  [ "$comment" = 1 ] && bash "$TOOLS/scripts/review-carry.sh" "$pr" || true
  [ $light_ok = 1 ]; exit $?
fi
# The tree under test: the head merged into origin/$base fetched just now, so it matches what the
# merge would land on (GitHub's merge ref can lag behind main).
git -C "$REPO" fetch -q origin "$base"
git -C "$REPO" worktree add -q --detach "$WT" "origin/$base"
if ! git -C "$WT" -c user.name=ci -c user.email=ci@localhost merge -q --no-edit "refs/ci/pr-$pr/head" >/dev/null 2>&1; then
  files="$(git -C "$WT" diff --name-only --diff-filter=U | sed 's/^/- `/; s/$/`/')"
  body="$(mktemp)"
  printf '### Local CI: FAIL\n\nHead `%s` does not merge cleanly into `%s`. Conflicting files:\n\n%s\n' "${head:0:7}" "$base" "$files" >"$body"
  cat "$body"
  url=""; [ "$comment" = 1 ] && url="$(gh pr comment "$pr" --body-file "$body")" && echo "ci-pr: posted to #$pr"
  status failure "Head does not merge cleanly into $base" "$url"; status_final=1
  rm -f "$body"
  exit 1
fi
base_sha="$(git -C "$REPO" rev-parse --short "origin/$base")"
what="merged into $base at $base_sha"
sha="$(git -C "$WT" rev-parse --short HEAD)"
# Same lockfile as this checkout and a real, complete install there: share it; otherwise
# ci-local installs clean.
if cmp -s "$REPO/package-lock.json" "$WT/package-lock.json" && [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] \
  && (cd "$REPO" && npm ls --depth=0 >/dev/null 2>&1); then
  ln -s "$REPO/node_modules" "$WT/node_modules"
fi

# The gate is main's local CI (from the base worktree) run on the tree under test, so a PR can never
# loosen the checks it is judged by. A PR that changes local CI itself (ci-local.sh, the scripts it
# runs, its path lists) is also run through its own version, and both must pass.
run_ci() { # <ci-local.sh> <summary file>
  CI_DIR="$WT" setsid bash "$1" --base "origin/$base" --title "$title" --summary "$2" 9>&- &
  ci_pid=$!
  wait "$ci_pid"; local r=$?
  ci_pid=""
  return $r
}
summary="$(mktemp)"; own_summary=""
t0=$(date +%s)
run_ci "$TOOLS/scripts/ci-local.sh" "$summary"
rc=$?
ci_changes="$(printf '%s\n' "$changed" | grep -E '^scripts/([^/]+\.sh|lib/.+|ci-[a-z-]+-paths)$' || true)"
if [ -n "$ci_changes" ]; then
  echo "ci-pr: #$pr changes local CI itself; running its own version too"
  own_summary="$(mktemp)"
  run_ci "$WT/scripts/ci-local.sh" "$own_summary"
  own_rc=$?
  [ $rc -eq 0 ] && rc=$own_rc
fi
secs=$(( $(date +%s) - t0 ))
verdict=$([ $rc -eq 0 ] && echo "PASS" || echo "FAIL")
# setup_s: everything before local CI (fetching, the worktree, waiting for this PR's lock, installing).
timing_log kind=run tool=ci-pr wall_s=$SECONDS ci_s=$secs setup_s=$(( SECONDS - secs )) exit=$rc

body="$(mktemp)"
{
  echo "### Local CI: $verdict"
  echo
  echo "Head \`${head:0:7}\`, tested as \`$sha\` ($what), in ${secs}s."
  echo
  [ -n "$own_summary" ] && { echo "**main's local CI** (the gate):"; echo; }
  cat "$summary"
  if [ -n "$own_summary" ]; then
    echo
    echo "**This PR's own local CI**, since it changes $(printf '%s\n' "$ci_changes" | sed 's/.*/`&`/' | paste -sd, - | sed 's/,/, /g'):"
    echo
    cat "$own_summary"
  fi
} >"$body"
cat "$body"
url=""; [ "$comment" = 1 ] && url="$(gh pr comment "$pr" --body-file "$body")" && echo "ci-pr: posted to #$pr"
status "$([ $rc -eq 0 ] && echo success || echo failure)" "Local CI $verdict in ${secs}s on ${sha} ($what)" "$url"; status_final=1
rm -f "$summary" "$body" ${own_summary:+"$own_summary"}
# A head that only merged main keeps the review pass of the head before it.
[ "$comment" = 1 ] && bash "$TOOLS/scripts/review-carry.sh" "$pr" || true
exit $rc
