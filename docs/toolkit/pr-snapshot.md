---
tool: `node scripts/tools/pr-snapshot.mjs [--max-age <s>] [--pr <n>] [--refresh]`
section: pr
who: all
covers: scripts/tools/pr-snapshot.mjs tests/tools/pr-snapshot.test.js
---
One shared snapshot of the repository's open pull requests, so the tools that watch them read a file instead of each running `gh pr list` or `gh pr view` every minute. It prints the snapshot as JSON (`fetchedAt`, `changedAt`, `ageSeconds`, `isStale`, `prs`), or with `--pr <n>` that PR's entry with its `signature` (exit 1 when it is not open). The file is `~/.cache/hitl-ci/pr-snapshot.json` (`HITL_PR_SNAPSHOT` moves it). A reader that finds it older than `--max-age` (default 60 s, jittered by 10 %) refreshes it first under a lock, so any number of readers cost one `gh pr list` per interval; when nothing in it has changed for 20 minutes the interval stretches to 120 s, and it is never under 15 s. `--refresh` forces a fetch. If GitHub cannot be read the old snapshot is returned with `isStale` true and the error; with none, exit 1. A refresher that is killed leaves a lock the next reader clears (the lock records its pid).

Each entry has number, title, state, isDraft, headRefName, headRefOid, baseRefName, mergeStateStatus, mergeable, statusCheckRollup, labels, autoMergeRequest, author, isCrossRepository, reviewDecision, updatedAt, url, and `comments` cut to the newest Local CI comment and the newest owner record. `signature` (also exported, with `ensureFresh`) is a string that changes when anything a watcher reacts to changes: state, head, merge state, draft flag, review decision, auto-merge, labels, or any check's result. `review-queue.mjs --wait` and `--drain` at an interval of 15 s or more read it.
