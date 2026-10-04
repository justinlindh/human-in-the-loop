#!/usr/bin/env bash
# Prints whether a PR head only merged its base into the PR's earlier tested head: 1 when it did (the
# PR's own diff from the base is unchanged, as a patch-id), 0 when the PR's own changes differ, na when
# there is no earlier head with a local-ci status or anything could not be read. The timing log records
# it per run, so merge-only heads can be timed apart from new work.
# Usage: scripts/ci-merge-only.sh <pr> <head sha> <base branch> [--repo <checkout>]
set -uo pipefail
pr="${1:-}"; head="${2:-}"; base="${3:-}"; REPO="$(cd "$(dirname "$0")/.." && pwd)"
[ "${4:-}" = --repo ] && REPO="${5:?}"
[ -n "$pr" ] && [ -n "$head" ] && [ -n "$base" ] || { echo na; exit 0; }
prev=""
for sha in $(gh api "repos/{owner}/{repo}/pulls/$pr/commits" --paginate --jq '.[].sha' 2>/dev/null | tac); do
  [ "$sha" = "$head" ] && continue
  n="$(gh api "repos/{owner}/{repo}/commits/$sha/statuses" --jq '[.[] | select(.context == "local-ci")] | length' 2>/dev/null)" || continue
  if [ "${n:-0}" -gt 0 ]; then prev="$sha"; break; fi
done
[ -n "$prev" ] || { echo na; exit 0; }
git -C "$REPO" cat-file -e "$prev^{commit}" 2>/dev/null || git -C "$REPO" fetch -q origin "$prev" 2>/dev/null || { echo na; exit 0; }
own() { git -C "$REPO" diff "$(git -C "$REPO" merge-base "origin/$base" "$1")" "$1" 2>/dev/null | git patch-id --stable | cut -d' ' -f1; }
a="$(own "$prev")"; b="$(own "$head")"
if [ -z "$a" ] || [ -z "$b" ]; then echo na
elif [ "$a" = "$b" ]; then echo 1
else echo 0; fi
