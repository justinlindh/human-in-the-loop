#!/usr/bin/env bash
# Conventional Commits check for a pull request: the PR title and every non-merge commit in
# base..head must read `type(scope): summary`. Commits made before the rule took effect are skipped.
# Usage: scripts/check-commits.sh <base-sha> <head-sha> "<pr title>"
set -euo pipefail

base="${1:?base sha}"; head="${2:?head sha}"; title="${3:-}"
PATTERN='^(feat|fix|perf|refactor|test|docs|build|ci|chore|style|revert)(\([a-z0-9-]+\))?!?: .+'
# Unix time of the merge that introduced the rule (PR #34).
SINCE=1790238663

bad=0
if [ -n "$title" ] && ! grep -qE "$PATTERN" <<<"$title"; then
  echo "PR title does not follow Conventional Commits: $title"
  bad=1
fi
while IFS=$'\t' read -r sha when subject; do
  [ "$when" -ge "$SINCE" ] || continue
  if ! grep -qE "$PATTERN" <<<"$subject"; then
    echo "commit ${sha:0:7} does not follow Conventional Commits: $subject"
    bad=1
  fi
done < <(git log --no-merges --format='%H%x09%ct%x09%s' "$base..$head")

if [ "$bad" -ne 0 ]; then
  echo "Expected: type(scope): summary, with type one of feat fix perf refactor test docs build ci chore style revert."
  exit 1
fi
echo "Conventional Commits: ok"
