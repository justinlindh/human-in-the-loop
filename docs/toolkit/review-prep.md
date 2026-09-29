---
tool: `scripts/review-prep.sh <pr> [--dir <root>] [--base] [--diff [path...]] [--since <sha>] [--head-at <sha>] [--merged] [--base-at <sha>] [--bot] [--no-checkout] [--json]`
section: pr
who: reviewer, team-lead
covers: scripts/review-prep.sh scripts/review-prep.test.sh
---
Everything a review opens with, in one call.
- **Trust gate, first:** a fork, or an author not in `scripts/ci-trusted`, exits 3 before anything is fetched. Dependabot needs `--bot`, which also refuses unless only `package.json`, `package-lock.json` or `.github/workflows/` change, and never checks out.
- **Header:** the head, the merge base and how far behind main it is, draft and labels, mergeability, the review, local-ci and GitHub check states, and the last verdict. When the head merges main after the last reviewed head, it says whether it equals a plain merge of that head ("merge-only ... clean"), differs from one (listing the files), or conflicted (listing the files; `--since <sha>` shows the resolution).
- **Files:** grouped by owning lane (from `lanes.txt`) with their line counts. Paths outside the branch's lane are flagged as lane exceptions.
- **Description:** the Affects, Changes to how the game plays, and Gates run entries, quoted.
- **Media:** every media file on the PR with when it was posted, starred when posted after the last verdict, and ready as `--watched` flags for `review-verdict.sh`.
- **Checkout:** a worktree of the head per PR at `<root>/review-<pr>` (`--dir`, or `HITL_REVIEW_DIR`), reset on each run. `--base` adds the merge base at `<root>/review-<pr>-base` for paired runs. node_modules is hard-linked from the running checkout when the lockfiles match (copied when across filesystems), else installed with `npm ci`; the output says which. `--head-at <sha>` adds one of the PR's own commits (say, the head you last reviewed; any other sha is refused) at `<root>/review-<pr>-at-<sha7>`, for before and after runs; `--merged` adds the head merged with current `origin/<base>` at `<root>/review-<pr>-merged` (a detached merge commit, so a newer tool or check measures the PR as it would land; a conflict exits 1, names the files and leaves no merged tree); `--base-at <sha>` puts the `--base` checkout at that commit instead of the merge base (implies `--base`), for `pair.js` against the last passed head. They combine (`--merged` with `--head-at` merges that earlier head), and `--json` lists each tree: kind, path, sha, and for `--merged` the `origin/<base>` sha it merged and the resulting tree sha. None of them changes what runs without a flag. `--done` removes every one of them.
- **Diff:** the stat by default, `--diff [path...]` for the diff, `--since <sha>` for the diff from a given head.
