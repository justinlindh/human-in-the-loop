---
tool: `scripts/review-prep.sh <pr> [--dir <root>] [--base] [--diff [path...]] [--since <sha>] [--bot] [--no-checkout] [--json]`
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
- **Checkout:** a worktree of the head per PR at `<root>/review-<pr>` (`--dir`, or `HITL_REVIEW_DIR`), reset on each run. `--base` adds the merge base at `<root>/review-<pr>-base` for paired runs. node_modules is hard-linked from the running checkout when the lockfiles match (copied when across filesystems), else installed with `npm ci`; the output says which. `--done` removes both worktrees.
- **Diff:** the stat by default, `--diff [path...]` for the diff, `--since <sha>` for the diff from a given head.
