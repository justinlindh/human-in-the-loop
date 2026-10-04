#!/usr/bin/env bash
# The trees local CI has passed in full, so the main guard can skip a main tip whose tree is one of them.
# ci-pr.sh records the tree it tested (the PR head merged into the base) after a full pass; the guard
# asks whether the tip's tree is recorded. A tree hash covers every file, so an equal tree is the same
# code, whatever commits led to it. Records older than 14 days are dropped when one is written.
# Usage: scripts/tested-trees.sh record <worktree> <pr> <head sha> <base>
#        scripts/tested-trees.sh check <tree sha | commit sha> [--repo <checkout>]   prints the record, exit 1 when none
# Env: HITL_TESTED_TREES (default ~/.cache/hitl-ci/tested-trees).
set -uo pipefail
dir="${HITL_TESTED_TREES:-$HOME/.cache/hitl-ci/tested-trees}"
case "${1:-}" in
  record)
    wt="${2:?}"; pr="${3:?}"; head="${4:?}"; base="${5:?}"
    tree="$(git -C "$wt" rev-parse 'HEAD^{tree}' 2>/dev/null)" || exit 1
    mkdir -p "$dir" && find "$dir" -type f -mtime +14 -delete 2>/dev/null
    printf 'pr=%s head=%s base=%s at=%s\n' "$pr" "${head:0:7}" "$base" "$(date -u +%FT%TZ)" >"$dir/$tree" ;;
  check)
    ref="${2:?}"; repo="."; [ "${3:-}" = --repo ] && repo="${4:?}"
    tree="$(git -C "$repo" rev-parse "$ref^{tree}" 2>/dev/null)" || exit 1
    [ -f "$dir/$tree" ] && cat "$dir/$tree" || exit 1 ;;
  *) echo "usage: scripts/tested-trees.sh record <worktree> <pr> <head> <base> | check <sha> [--repo <checkout>]" >&2; exit 2 ;;
esac
