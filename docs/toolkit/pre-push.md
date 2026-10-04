---
tool: `scripts/hooks/pre-push` (`npm run hooks`)
section: pr
covers: scripts/hooks/pre-push scripts/hooks/pre-push.test.sh scripts/hooks/post-checkout scripts/test-push.sh
---
Before every push:
- It refuses pushes to a branch whose PR has already merged or closed.
- It runs `npm run test:push` and refuses the push when that fails, so an ungated push can't happen. `test:push` (`scripts/test-push.sh`) runs only the tests related to the plain JS under `src/`, `tests/` and `scripts/` that the branch changed, niced, through `scripts/tools/test-related.sh` and the test cache; with no such file it runs nothing. GitHub's required `test` check runs the full suite, and `npm run test:fast` runs it by hand. Where `package.json` has no `test:push` the hook runs `test:fast`. A cached run on a tree that already passed costs well under a second.
- It tests the checkout as it is, uncommitted changes included, and says so when the tree is dirty.
- The test gate is skipped in CI, for a push that only touches the `pr-media` branch or deletes branches, and where `package.json` has no `test:fast`.
- `git push --no-verify` skips both once.
Before the tests it runs `scripts/check-commits.sh` over the commits the push adds beyond `origin/main`, so a `wip:` or otherwise non-conventional commit, or one with attribution, refuses the push (skipped in CI and when `origin/main` or the script is missing). The `post-checkout` hook links `node_modules` from the main checkout into every new `git worktree add` worktree, so this gate runs there without an install.
