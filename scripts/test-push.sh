#!/usr/bin/env bash
# The pre-push test run: only the tests that import the plain JS files this branch changed
# (scripts/tools/test-related.sh, through the test cache), at nice 10 with the vitest worker cap.
# GitHub's required `test` check runs the full suite on every PR, so a push doesn't repeat it.
# Changed = committed since the merge base with origin/main, plus modified and untracked files. Files
# that are not plain JS under src/, tests/ or scripts/ (docs, data, config, shell scripts) have no
# import graph to follow and are left to GitHub. Run `npm run test:fast` by hand for the full suite.
# Usage: scripts/test-push.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
base="$(git merge-base origin/main HEAD 2>/dev/null || echo HEAD)"
files="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u \
  | while read -r f; do [ -e "$f" ] && echo "$f"; done \
  | grep -E '^((src|tests)/([^/]+/){0,2}[^/]+\.js|scripts/([^/]+/)?[^/]+\.(js|mjs))$' || true)"
if [ -z "$files" ]; then
  echo "test-push: no changed JS under src, tests or scripts: nothing to run here (GitHub runs the full suite)"
  exit 0
fi
# A change that reaches many test files (a core module, the config) gains nothing from a long local
# run that GitHub repeats; past HITL_PUSH_TEST_MAX test files (default 40) the push leaves it there.
max="${HITL_PUSH_TEST_MAX:-40}"
count="$(npx vitest list --filesOnly --changed "$base" 2>/dev/null | grep -c '\.test\.[cm]\?js$')"
if [ "${count:-0}" -gt "$max" ]; then
  echo "test-push: the changes reach $count test files (more than $max): skipped here, GitHub's test check runs the full suite"
  exit 0
fi
# shellcheck disable=SC2086
exec bash scripts/nice10.sh bash scripts/tools/test-related.sh --files $files
