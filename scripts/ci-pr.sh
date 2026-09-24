#!/usr/bin/env bash
# Local CI for a pull request, posted to the PR as the merge gate. Tests the PR merged into its base
# (GitHub's merge ref) when there is one, else the PR head, in a throwaway worktree.
# Usage: scripts/ci-pr.sh <pr-number> [--no-comment]
set -uo pipefail

pr="${1:?usage: scripts/ci-pr.sh <pr-number> [--no-comment]}"
comment=1; [ "${2:-}" = "--no-comment" ] && comment=0
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WT="${CI_WORKTREE_ROOT:-$HOME/.cache/hitl-ci}/pr-$pr"

read -r head base title < <(gh pr view "$pr" --json headRefOid,baseRefName,title --jq '[.headRefOid, .baseRefName, .title] | @tsv' | tr '\t' '\037' | awk -F'\037' '{ printf "%s %s %s\n", $1, $2, $3 }')
[ -n "$head" ] || { echo "ci-pr: cannot read PR #$pr" >&2; exit 2; }

git -C "$REPO" fetch -q origin "$base" "+refs/pull/$pr/head:refs/ci/pr-$pr/head"
if git -C "$REPO" fetch -q origin "+refs/pull/$pr/merge:refs/ci/pr-$pr/merge" 2>/dev/null; then
  ref="refs/ci/pr-$pr/merge"; what="merged into $base"
else
  ref="refs/ci/pr-$pr/head"; what="head only (no merge ref: conflicts?)"
fi
sha="$(git -C "$REPO" rev-parse --short "$ref")"

rm -rf "$WT"; git -C "$REPO" worktree prune
git -C "$REPO" worktree add -q --detach "$WT" "$ref"
cleanup() { git -C "$REPO" worktree remove --force "$WT" 2>/dev/null; }
trap cleanup EXIT
# Same lockfile as the main checkout: share its node_modules; otherwise ci-local installs clean.
if cmp -s "$REPO/package-lock.json" "$WT/package-lock.json" && [ -d "$REPO/node_modules" ]; then
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
[ "$comment" = 1 ] && gh pr comment "$pr" --body-file "$body" >/dev/null && echo "ci-pr: posted to #$pr"
rm -f "$summary" "$body"
exit $rc
