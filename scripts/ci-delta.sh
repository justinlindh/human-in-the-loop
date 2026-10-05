#!/usr/bin/env bash
# Lists the files in which the tree local CI is about to test differs from the tree it last passed in
# full for this PR (scripts/tested-trees.sh). A check whose inputs are none of those files has the same
# result it had on that pass, so ci-local.sh can skip it. Writes one path per line to <out> and prints a
# summary; exits 1 and writes nothing when the PR has no passed tree (or the repository no longer has it),
# which means every check runs.
# Usage: scripts/ci-delta.sh <pr> <worktree> <out file> [--repo <checkout>]
# Env: CI_NO_DELTA=1 writes nothing (runs everything).
set -uo pipefail
pr="${1:-}"; wt="${2:-}"; out="${3:-}"
[ -n "$pr" ] && [ -n "$wt" ] && [ -n "$out" ] || { echo "usage: scripts/ci-delta.sh <pr> <worktree> <out file> [--repo <checkout>]" >&2; exit 2; }
repo="$wt"; [ "${4:-}" = --repo ] && repo="${5:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ "${CI_NO_DELTA:-}" = 1 ] && { echo "ci-delta: CI_NO_DELTA=1; every check runs"; exit 1; }
last="$(bash "$HERE/tested-trees.sh" last "$pr" --repo "$repo")" || { echo "ci-delta: #$pr has no passed tree; every check runs"; exit 1; }
now="$(git -C "$wt" rev-parse 'HEAD^{tree}' 2>/dev/null)" || { echo "ci-delta: cannot read the tree under test; every check runs"; exit 1; }
tmp="$(mktemp)"
git -C "$wt" diff --name-only --no-renames "$last" "$now" >"$tmp" 2>/dev/null \
  || { rm -f "$tmp"; echo "ci-delta: cannot diff against the last passed tree; every check runs"; exit 1; }
mv "$tmp" "$out"
echo "ci-delta: $(wc -l <"$out" | tr -d ' ') file(s) differ from the tree #$pr last passed (${last:0:7})"
