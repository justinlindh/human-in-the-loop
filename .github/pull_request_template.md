## What

<!-- One or two sentences: what this PR changes and why. Link the task (e.g. S20, A21, U15) and any design doc. -->

## Changes

<!-- Bullets, grouped by area. Say what a player sees, not just what the code does. -->
-

## Evidence

<!-- Required. Nothing here may be a local path (/home, /tmp, scratchpad). -->
- **Tests:** <!-- exact command and result line, e.g. `npm test`: "Tests 493 passed (493)" -->
- **Screenshots or clips:** <!-- post them with `scripts/pr-media.sh --comment <pr> <files>`; paste the markdown here or reference the comment -->
- **Numbers:** <!-- balance tables, perf (draw calls, frame times), pacing, as relevant -->

## Checklist

- [ ] Commits and the PR title follow Conventional Commits (`type(scope): summary`)
- [ ] Every commit was gated on the test command's exit code
- [ ] No local paths and no Claude attribution or session lines anywhere in the PR or its commits
- [ ] Stays within the lane's paths (or the owning lane agreed)
- [ ] Contract changes, if any, went through team-lead

## Closes

<!-- e.g. Fixes #14. Leave empty if none. -->

<!-- After creating the PR, turn on auto-merge so GitHub merges it once every required check passes
     (local-ci, review, test, balance, browser, commits):  gh pr merge <number> --auto --merge
     Check where your PRs stand with scripts/pr-status.sh. -->
