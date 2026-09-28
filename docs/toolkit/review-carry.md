---
tool: `scripts/review-carry.sh <pr>`
section: pr
covers: scripts/review-carry.sh scripts/merge-union-check.mjs scripts/merge-union-check.test.sh
---
Carries a review pass to a new head that only merges `main` in (ci-pr runs it after posting local CI). It also carries across a merge you resolved by hand, once `local-ci` has passed on the new head, when `scripts/merge-union-check.mjs` finds that each conflict only kept both sides:
1. The head is a merge whose first parent is the head that passed and whose second parent is on `main`.
2. The head differs from git's own merge only in conflicted regions, each resolved as ours then theirs, or theirs then ours, verbatim.
   - In `src/data/*.js`, no key may appear twice in a region.
   - In tests, no test name may appear twice in the file.
   - In `src/sim/balance.js`, one line may hold both sides' keys, with no key given two values.
3. Conflicts are only in `docs/`, `*.md` (not `src/contract/`), `src/data/*.js`, tests, or that one `balance.js` line.
4. `main` changed none of the PR's own `src/` files outside those.

One more hand change carries: when main split `docs/features.md` into `docs/features/<area>.md` while the PR edited the old file, the merge may delete it and move the PR's own line edits verbatim into the area files. The lines the PR removed and added there must be exactly the lines the merge removes and adds under `docs/features/`, and nothing else there may change.

When a rule fails, ci-pr's output names it (for example "rule 2: docs/x.md: a conflict wasn't resolved by keeping both sides verbatim"), and the PR needs a fresh verdict. Run `node scripts/merge-union-check.mjs <passed-head> <new-head> origin/main` to check a merge before pushing it.
