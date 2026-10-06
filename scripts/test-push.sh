#!/usr/bin/env bash
# The pre-push and smoke test run: the tests that import the plain JS files this branch changed
# (scripts/tools/test-related.sh, through the test cache), at nice 10 with the vitest worker cap.
# PRs run no other tests; the full suite runs at release (scripts/release.sh).
# Changed = committed since the merge base with origin/main, plus modified and untracked files. Files
# that are not plain JS under src/, tests/ or scripts/ (docs, data, config, shell scripts) have no
# import graph to follow and are left to the release. Run `npm run test:fast` by hand for the full suite.
# Usage: scripts/test-push.sh   (HITL_PUSH_TEST_MAX=N skips a change that reaches more than N test files)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
base="$(git merge-base origin/main HEAD 2>/dev/null || echo HEAD)"
changed="$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u \
  | while read -r f; do [ -e "$f" ] && echo "$f"; done)"
files="$(grep -E '^((src|tests)/([^/]+/){0,2}[^/]+\.js|scripts/([^/]+/)?[^/]+\.(js|mjs))$' <<<"$changed" || true)"
# A shell script a test runs by its path (scripts/tools/spawned-tests.mjs names that test) goes along
# too, so test-related adds the test; one no test runs is left to the release.
shells="$(grep -E '^scripts/([^/]+/)?[^/]+\.sh$' <<<"$changed" | grep -v '\.test\.sh$' || true)"
if [ -n "$shells" ] && [ -f scripts/tools/spawned-tests.mjs ]; then
  # shellcheck disable=SC2086
  files+=$'\n'"$(node scripts/tools/spawned-tests.mjs --reached $shells 2>/dev/null)"
fi
files="$(sed '/^$/d' <<<"$files")"
if [ -z "$files" ]; then
  echo "test-push: no changed JS under src, tests or scripts: nothing to run here (the release runs the full suite)"
  exit 0
fi
# A wide change (a core module, the config) runs every test it reaches: nothing else tests it before
# merge. HITL_PUSH_TEST_MAX, when set, skips one that reaches more than that many test files.
count="$(npx vitest list --filesOnly --changed "$base" 2>/dev/null | grep -c '\.test\.[cm]\?js$')"
if [ -n "${HITL_PUSH_TEST_MAX:-}" ] && [ "${count:-0}" -gt "$HITL_PUSH_TEST_MAX" ]; then
  echo "test-push: the changes reach $count test files (more than HITL_PUSH_TEST_MAX=$HITL_PUSH_TEST_MAX): skipped; no tests ran, and none run before merge (the release runs the full suite)"
  exit 0
fi
echo "test-push: the changes reach ${count:-0} test files: running them"
# shellcheck disable=SC2086
exec bash scripts/nice10.sh bash scripts/tools/test-related.sh --files $files
