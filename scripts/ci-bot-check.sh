#!/usr/bin/env bash
# Decides whether `ci-pr.sh --allow-bot` may run a pull request: exit 0 to run it, 2 to refuse with the
# reason on stderr. A Dependabot PR qualifies only if all of these hold:
#   - its author is the Dependabot app (REST login exactly dependabot[bot], type Bot);
#   - it comes from a branch of this repository;
#   - every commit is authored by Dependabot;
#   - it changes only package.json, package-lock.json or files under .github/workflows/.
# Usage: scripts/ci-bot-check.sh <login> <user-type> <isCrossRepository> <head-owner> <repo-owner> \
#          <changed-paths-file> <commit-author-emails-file>
set -uo pipefail

BOT_LOGIN='dependabot[bot]'
BOT_EMAIL='49699333+dependabot[bot]@users.noreply.github.com'

login="${1-}"; type="${2-}"; cross="${3-}"; head_owner="${4-}"; repo_owner="${5-}"; paths="${6-}"; authors="${7-}"
refuse() { echo "ci-bot-check: $*; not running it" >&2; exit 2; }

[ "$login" = "$BOT_LOGIN" ] && [ "$type" = Bot ] || refuse "author is $login ($type), not $BOT_LOGIN"
[ "$cross" = false ] && [ -n "$repo_owner" ] && [ "$head_owner" = "$repo_owner" ] \
  || refuse "head is not a branch of this repository"

[ -f "$paths" ] && grep -q . "$paths" || refuse "no changed files"
while IFS= read -r p || [ -n "$p" ]; do
  case "$p" in
    '') ;;
    package.json|package-lock.json|.github/workflows/?*) ;;
    *) refuse "changes $p (only package.json, package-lock.json and .github/workflows/ are allowed)" ;;
  esac
done <"$paths"

[ -f "$authors" ] && grep -q . "$authors" || refuse "no commits"
while IFS= read -r a || [ -n "$a" ]; do
  [ -z "$a" ] || [ "$a" = "$BOT_EMAIL" ] || refuse "has a commit by $a, not Dependabot"
done <"$authors"
exit 0
