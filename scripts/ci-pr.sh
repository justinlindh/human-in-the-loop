#!/usr/bin/env bash
# Local CI for a pull request, posted to the PR as the merge gate. Tests the PR merged into its base
# (GitHub's merge ref) when there is one, else the PR head, in a throwaway worktree.
# Besides the comment it sets the commit status "local-ci" on the PR head (pending while it runs,
# then success or failure), which branch protection can require.
# Usage: scripts/ci-pr.sh <pr-number> [--no-comment]   (--no-comment also skips the status)
set -uo pipefail

pr="${1:?usage: scripts/ci-pr.sh <pr-number> [--no-comment]}"
comment=1; [ "${2:-}" = "--no-comment" ] && comment=0
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}"
mkdir -p "$ROOT"
# One run per PR at a time, each in its own worktree: overlapping runs sharing a path deleted
# each other's trees mid-run.
exec 9>"$ROOT/pr-$pr.lock"
flock -n 9 || { echo "ci-pr: another run for #$pr is in progress; not starting a second one" >&2; exit 3; }
WT="$ROOT/pr-$pr-$$"

read -r head base title < <(gh pr view "$pr" --json headRefOid,baseRefName,title --jq '[.headRefOid, .baseRefName, .title] | @tsv' | tr '\t' '\037' | awk -F'\037' '{ printf "%s %s %s\n", $1, $2, $3 }')
[ -n "$head" ] || { echo "ci-pr: cannot read PR #$pr" >&2; exit 2; }

# Commit status "local-ci" on the PR head: status <state> <description> [target url].
status_final=0
status() {
  [ "$comment" = 1 ] || return 0
  gh api "repos/{owner}/{repo}/statuses/$head" -f state="$1" -f context=local-ci -f description="$2" \
    ${3:+-f target_url="$3"} >/dev/null 2>&1 || echo "ci-pr: could not set the local-ci status" >&2
}

git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/ci/pr-$pr/head"
git -C "$REPO" worktree prune
cleanup() {
  git -C "$REPO" worktree remove --force "$WT" 2>/dev/null
  # A run that stops before its verdict must not leave the status pending forever.
  [ "$status_final" = 1 ] || status error "Local CI stopped before finishing; run scripts/ci-pr.sh $pr again"
}
trap cleanup EXIT
status pending "Local CI running"
if git -C "$REPO" fetch -q origin "+refs/pull/$pr/merge:refs/ci/pr-$pr/merge" 2>/dev/null; then
  git -C "$REPO" worktree add -q --detach "$WT" "refs/ci/pr-$pr/merge"
  what="GitHub's merge into $base"
else
  # GitHub has not computed a merge ref yet (or cannot): merge the head into the base here.
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
CI_DIR="$WT" bash "$REPO/scripts/ci-local.sh" --base "origin/$base" --title "$title" --summary "$summary"
rc=$?
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
exit $rc
