# Publishing the repo

How the private repo becomes a fresh public `human-in-the-loop` with a cleaned history. team-lead
calls the quiet point and gives the go; the integrator runs the steps and reports evidence for each.
Nothing on GitHub changes before the go.

## 0. Quiet point

- [ ] The PRs that should ship are merged into `feat/one-shot`, each with a Local CI PASS comment.
- [ ] Every lane has pushed; no lane pushes to the old repo from the announcement until the lanes
      are re-pointed (section 4).
- [ ] Open PRs that will not merge first are listed; they are re-opened on the new repo later.

## 1. Build the cleaned history

`scripts/publish-history.sh <scratch-dir>` makes a fresh clone of `feat/one-shot` only and rewrites
it with git-filter-repo:

- removes `docs/superpowers/specs/2026-09-24-audio-tools-report.md` from every commit (commits that
  touched nothing else disappear);
- strips `Co-Authored-By`, `Claude-Session`, and "Generated with Claude Code" lines from messages;
- replaces home-directory paths in file contents and messages (`<home>/src/gamedev*` becomes a
  relative `../gamedev*`, anything else under the home directory becomes `~/`);
- leaves one branch, `main`, with no remotes, tags, or other refs (no `pr-media`, lane, or topic
  branches).

The audit's list of local names (paths, ports, service and project names) is not in the repo. It is
read from `~/.config/hitl-publish/audit.txt` (or `PUBLISH_AUDIT_FILE`), one extended regex per line.

## 2. Verify

The script runs these and exits non-zero if any fails:

- [ ] The audio report is absent from every commit.
- [ ] No attribution lines in any message.
- [ ] The audit grep finds nothing in any diff or message of the full history.
- [ ] Only `main` exists.
- [ ] `gitleaks git` reports no findings over the full history.
- [ ] `trufflehog git` reports no verified or unknown secrets over the full history.
- [ ] `npm run ci` passes on the rewritten tree.

Plus the pre-publication review's own list, checked against the rewrite through filter-repo's
commit map (`.git/filter-repo/commit-map` in the scratch clone):

- [ ] The roster commits with absolute worktree paths (old `8368133`, `76a77c3`, `d27a9be`,
      `0e7b27e`) have rewritten counterparts with no home paths; the roster reads `../gamedev*`.
- [ ] The commits that carried the audio report (old `8ede3e3`, `cccef12`) no longer contain it:
      a commit that only touched the report is gone, the other keeps its other changes.
- [ ] Every term the review found only inside the report returns zero hits in the rewrite.
- [ ] Zero `Claude-Session` and zero `Co-Authored-By` lines remain.
- [ ] Only `refs/heads/main` exists; nothing else is pushed.

## 3. Switch (after the go)

- [ ] Tell every lane the move is starting; nobody pushes to the old repo until section 4.
- [ ] Rebuild the cleaned history from the current `feat/one-shot` (section 1) and re-run section 2.
- [ ] Rename the current repo to `human-in-the-loop-private` (it stays private):
      `gh repo rename human-in-the-loop-private`.
- [ ] Create the public repo: `gh repo create justinlindh/human-in-the-loop --public`.
- [ ] Push the rewritten `main` only:
      `git remote add origin git@github.com:justinlindh/human-in-the-loop.git && git push -u origin main`.
- [ ] Settings: `gh repo edit justinlindh/human-in-the-loop --default-branch main --delete-branch-on-merge`;
      Actions enabled.
- [ ] Transfer the open issues from the private repo
      (`gh issue transfer <n> justinlindh/human-in-the-loop` for each).
- [ ] Social preview (`docs/readme/social-preview.png`): GitHub has no API for it; upload it in the
      repo's Settings page.
- [ ] First PR on the new repo: the workflow runs on push and pull_request again (public repos have
      free Actions minutes), and CLAUDE.md, the scripts, and the docs name `main` instead of
      `feat/one-shot` as the integration branch.

## 4. Re-point the worktrees (every lane)

Every commit SHA changes, and the new history shares no commits with the old one, so old branches
are never merged or rebased across. At the quiet point every lane's work is already in `main`. In
each worktree:

```sh
git remote rename origin private
git remote add origin git@github.com:justinlindh/human-in-the-loop.git
git fetch origin
git log --oneline private/feat/one-shot..HEAD     # anything not yet merged, to carry over
git switch -C lane/<lane> origin/main
git cherry-pick <those commits, if any>            # patch content is unchanged by the rewrite
git push -u origin lane/<lane>
```

- [ ] sim, art, ui, the integrator, and team-lead each confirm their worktree tracks the new repo.
- [ ] The preview script and local CI run against the new `main`.
- [ ] The private repo stays as the archive of the original history and the old PRs.
