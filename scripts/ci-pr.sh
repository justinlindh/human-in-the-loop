#!/usr/bin/env bash
# Local CI for a pull request, posted to the PR as the merge gate. Tests the PR merged into its base
# (GitHub's merge ref) when there is one, else the PR head, in a throwaway worktree.
# Besides the comment it sets the commit status "local-ci" on the PR head (pending while it runs,
# then success or failure), which branch protection can require.
# Usage: scripts/ci-pr.sh <pr-number> [--no-comment] [--head <sha>]
#   --no-comment  no comment and no status (a local check)
#   --head        the head to test, such as the commit just pushed: waits until GitHub reports it
set -uo pipefail

usage="usage: scripts/ci-pr.sh <pr-number> [--no-comment] [--head <sha>]"
pr="${1:?$usage}"; shift
comment=1; want=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-comment) comment=0; shift ;;
    --head) want="${2:?$usage}"; shift 2 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}"

# Local CI runs the PR's code on this machine (npm install scripts, tests, a dev server, a browser),
# so it only runs PRs from a branch of this repository by an author listed in scripts/ci-trusted.
# Nothing is fetched, checked out or posted for any other PR.
TRUSTED="${CI_TRUSTED_FILE:-$REPO/scripts/ci-trusted}"
pr_trusted() { # <isCrossRepository> <head repo owner> <author> <repo owner>
  [ "$1" = false ] || { echo "ci-pr: #$pr comes from a fork ($2); not running it" >&2; return 1; }
  [ "$2" = "$4" ] || { echo "ci-pr: #$pr head repository belongs to $2, not $4; not running it" >&2; return 1; }
  grep -qxF -- "$3" <(tr -d '\r' <"$TRUSTED" 2>/dev/null | sed -e 's/#.*//' -e 's/[[:blank:]]//g' | grep -v '^$') \
    || { echo "ci-pr: #$pr is by $3, who is not in scripts/ci-trusted; not running it" >&2; return 1; }
}
# Fields are split on the unit separator, which read never merges: an empty field stays empty
# instead of shifting the next one (such as the branch name) into its place.
pr_fields="$(gh pr view "$pr" --json isCrossRepository,headRepositoryOwner,author,headRefName \
  --jq '[.isCrossRepository, (.headRepositoryOwner.login // ""), (.author.login // ""), .headRefName] | map(tostring) | join("\u001f")')"
IFS=$'\037' read -r cross owner author branch <<<"$pr_fields"
repo_owner="$(gh repo view --json owner --jq .owner.login)"
[ -n "${cross:-}" ] && [ -n "$repo_owner" ] || { echo "ci-pr: cannot read PR #$pr" >&2; exit 2; }
pr_trusted "$cross" "$owner" "$author" "$repo_owner" || exit 2
mkdir -p "$ROOT"
# One run per PR at a time, each in its own worktree: overlapping runs sharing a path deleted
# each other's trees mid-run.
exec 9>"$ROOT/pr-$pr.lock"
flock -n 9 || { echo "ci-pr: another run for #$pr is in progress; not starting a second one" >&2; exit 3; }
WT="$ROOT/pr-$pr-$$"

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
[ "$(git -C "$REPO" rev-parse "refs/ci/pr-$pr/head")" = "$head" ] \
  || { echo "ci-pr: refs/pull/$pr/head is not yet $head; try again shortly" >&2; exit 2; }
# The head must also be the tip of the PR's branch in this repository, not only a pull ref.
[ "$(git -C "$REPO" ls-remote origin "refs/heads/$branch" | cut -f1)" = "$head" ] \
  || { echo "ci-pr: ${head:0:7} is not the tip of $branch in this repository; not running it" >&2; exit 2; }
git -C "$REPO" worktree prune
ci_pid=""
cleanup() {
  # Local CI runs in its own process group; stop all of it (tests, browsers, dev servers) too.
  [ -n "$ci_pid" ] && kill -- "-$ci_pid" 2>/dev/null
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
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
changed="$(git -C "$REPO" diff --name-only "$mb" "refs/ci/pr-$pr/head")"
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
  if "$REPO/scripts/check-commits.sh" "$mb" "refs/ci/pr-$pr/head" "$title" >/dev/null 2>&1; then table+=$'\n'"| commits | pass |"
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
  [ "$comment" = 1 ] && bash "$REPO/scripts/review-carry.sh" "$pr" || true
  [ $light_ok = 1 ]; exit $?
fi
# GitHub rebuilds the merge ref after each push; use it only when it merges this head.
if git -C "$REPO" fetch -q origin "+refs/pull/$pr/merge:refs/ci/pr-$pr/merge" 2>/dev/null \
  && [ "$(git -C "$REPO" rev-parse "refs/ci/pr-$pr/merge^2" 2>/dev/null)" = "$head" ]; then
  git -C "$REPO" worktree add -q --detach "$WT" "refs/ci/pr-$pr/merge"
  what="GitHub's merge into $base"
else
  # No current merge ref from GitHub: merge the head into the base here.
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
  what="merged into $base locally"
fi
sha="$(git -C "$WT" rev-parse --short HEAD)"
# Same lockfile as this checkout and a real, complete install there: share it; otherwise
# ci-local installs clean.
if cmp -s "$REPO/package-lock.json" "$WT/package-lock.json" && [ -d "$REPO/node_modules" ] && [ ! -L "$REPO/node_modules" ] \
  && (cd "$REPO" && npm ls --depth=0 >/dev/null 2>&1); then
  ln -s "$REPO/node_modules" "$WT/node_modules"
fi

summary="$(mktemp)"
t0=$(date +%s)
# This checkout's ci-local.sh, so PRs cut before it existed are tested the same way.
CI_DIR="$WT" setsid bash "$REPO/scripts/ci-local.sh" --base "origin/$base" --title "$title" --summary "$summary" &
ci_pid=$!
wait "$ci_pid"
rc=$?
ci_pid=""
secs=$(( $(date +%s) - t0 ))
verdict=$([ $rc -eq 0 ] && echo "PASS" || echo "FAIL")

body="$(mktemp)"
{
  echo "### Local CI: $verdict"
  echo
  echo "Head \`${head:0:7}\`, tested as \`$sha\` ($what), in ${secs}s."
  echo
  cat "$summary"
} >"$body"
cat "$body"
url=""; [ "$comment" = 1 ] && url="$(gh pr comment "$pr" --body-file "$body")" && echo "ci-pr: posted to #$pr"
status "$([ $rc -eq 0 ] && echo success || echo failure)" "Local CI $verdict in ${secs}s on ${sha} ($what)" "$url"; status_final=1
rm -f "$summary" "$body"
# A head that only merged main keeps the review pass of the head before it.
[ "$comment" = 1 ] && bash "$REPO/scripts/review-carry.sh" "$pr" || true
exit $rc
