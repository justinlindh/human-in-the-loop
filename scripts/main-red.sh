#!/usr/bin/env bash
# Reports a finished `ci` run on main in one issue labelled main-red (run by .github/workflows/main-red.yml):
# a red run opens the issue, or comments on the open one, naming the commit and the jobs that failed; a green
# run on the current tip of main closes it. A green run of an older commit changes nothing.
# Env: GH_TOKEN, REPO (owner/name), RUN_ID, RUN_URL, SHA (the commit the run tested), CONCLUSION.
# Usage: scripts/main-red.sh
set -euo pipefail
: "${REPO:?}" "${RUN_ID:?}" "${RUN_URL:?}" "${SHA:?}" "${CONCLUSION:?}"
gh label create main-red --repo "$REPO" --color B60205 --description "ci is failing on main" 2>/dev/null || true
open="$(gh issue list --repo "$REPO" --label main-red --state open --json number --jq '.[0].number // empty')"
short="${SHA:0:8}"
case "$CONCLUSION" in
  success)
    tip="$(gh api "repos/$REPO/commits/main" --jq .sha)"
    if [ -n "$open" ] && [ "$tip" = "$SHA" ]; then
      gh issue close "$open" --repo "$REPO" --comment "ci passed on main at $short ($RUN_URL). Closing."
    fi
    ;;
  failure|timed_out|startup_failure)
    subject="$(gh api "repos/$REPO/commits/$SHA" --jq '.commit.message | split("\n")[0]')"
    failed="$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" --jq '[.jobs[] | select(.conclusion == "failure" or .conclusion == "timed_out") | "- \(.name): \(.html_url)"] | join("\n")')"
    body="$(printf 'ci failed on main at %s (%s)\n\nRun: %s\n\nFailed jobs:\n%s\n\nFix forward, or revert the commit.' "$short" "$subject" "$RUN_URL" "${failed:-- none reported (see the run)}")"
    if [ -n "$open" ]; then
      gh issue comment "$open" --repo "$REPO" --body "$body"
    else
      gh issue create --repo "$REPO" --label main-red --title "main is red: ci failed at $short" --body "$body"
    fi
    ;;
  *) echo "conclusion $CONCLUSION: nothing to report" ;;
esac
