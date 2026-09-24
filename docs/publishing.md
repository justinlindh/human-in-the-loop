# Publishing the repo

How the private repo becomes a fresh public `human-in-the-loop`, with a cleaned history. team-lead
calls the quiet point and does the GitHub-side steps with the user's approval; the integrator builds
and verifies the history.

## 0. Quiet point

- [ ] Every PR that should ship is merged into `feat/one-shot`, and its Local CI comment says PASS.
- [ ] No lane has unpushed work it wants to keep (lanes commit and push, or note what they will
      re-apply by hand).
- [ ] Open PRs that will not merge first are listed: they are re-opened against the new repo later.

## 1. Build the cleaned history (integrator)

`scripts/publish-history.sh <scratch-dir>` makes a fresh clone of `feat/one-shot` only and rewrites it
with git-filter-repo:

- removes `docs/superpowers/specs/2026-09-24-audio-tools-report.md` from every commit;
- strips `Co-Authored-By`, `Claude-Session`, and "Generated with Claude Code" lines from messages;
- replaces home-directory paths in file contents and messages (`<home>/src/gamedev*` becomes a
  relative `../gamedev*`, anything else under the home directory becomes `~/`);
- leaves one branch, `main`, with no remotes, tags, or other refs (no `pr-media`, lane, or topic
  branches).

The audit's list of local names (paths, ports, service and project names) is not in the repo. It is
read from `~/.config/hitl-publish/audit.txt` (or `PUBLISH_AUDIT_FILE`), one extended regex per line.

## 2. Verify (the same script, automatically)

- [ ] The audio report is absent from every commit.
- [ ] No attribution lines in any message.
- [ ] The audit grep finds nothing in any diff or message of the full history.
- [ ] Only `main` exists.
- [ ] `gitleaks git` reports no findings over the full history.
- [ ] `trufflehog git` reports no verified or unknown secrets over the full history.
- [ ] `npm run ci` passes on the rewritten tree.

The script exits non-zero if any check fails. Read its output before going further.

## 3. Switch (team-lead, with the user's approval)

- [ ] Rename the current repo to `human-in-the-loop-private` (it stays private):
      `gh repo rename human-in-the-loop-private`.
- [ ] Create the new public repo: `gh repo create justinlindh/human-in-the-loop --public`.
- [ ] Push the rewritten history from the scratch clone:
      `git remote add origin git@github.com:justinlindh/human-in-the-loop.git && git push -u origin main`.
- [ ] Make `main` the default branch; turn on delete-branch-on-merge
      (`gh repo edit --default-branch main --delete-branch-on-merge`); make sure Actions is enabled.
      (Public repos have free Actions minutes: the workflow can go back to push and pull_request.)
- [ ] Transfer the open issues from the private repo (`gh issue transfer <n> justinlindh/human-in-the-loop`).
- [ ] Update CLAUDE.md, the spec, and scripts that name `feat/one-shot` as the integration branch to
      `main`, in the first PR on the new repo.

## 4. Re-point the worktrees (every lane)

Every commit SHA changes, so nothing is merged or rebased across the two histories. In each worktree:

```sh
git remote rename origin private
git remote add origin git@github.com:justinlindh/human-in-the-loop.git
git fetch origin
# Work already on feat/one-shot is in main. Anything the lane had beyond it:
git log --oneline private/feat/one-shot..HEAD      # the commits to carry over
git switch -c lane/<lane>-new origin/main
git cherry-pick <those commits>                      # patch content is unchanged by the rewrite
git branch -M lane/<lane>-new lane/<lane> && git push -u origin lane/<lane>
```

- [ ] sim, art, ui, the integrator, and team-lead each confirm their worktree tracks the new repo.
- [ ] The preview script and local CI run against the new `main` (`scripts/preview.sh`,
      `scripts/ci-pr.sh`).
- [ ] The private repo stays as the archive of the original history and the old PRs.
