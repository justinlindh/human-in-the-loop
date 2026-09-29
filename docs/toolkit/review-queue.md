---
tool: `node scripts/tools/review-queue.mjs [--wait | --drain] [--repo owner/name]... [--interval s] [--timeout s] [--json]`
section: pr
who: reviewer, team-lead
covers: scripts/tools/review-queue.mjs tests/tools/review-queue.test.js
---
The pull requests waiting for a review verdict, all of them at once, in the groups a reviewer handles differently. A PR is in the queue when it is open into main, not a draft, not held by `awaiting-user`, and no `review` verdict is on its current head. It leaves only when a verdict is posted on that head (or it is held, closed, or pushed to a new head); nothing is remembered between runs, so running it again returns whatever is still waiting, and a review that was started and not finished stays listed.

- `READY`: same repo, author in `scripts/ci-trusted`, `local-ci` green on the head. Review it.
- `DEPENDABOT`: a Dependabot PR. Read its diff and changelogs first with no install; CI comes after the verdict.
- `OUTSIDE`: a fork or an author outside `scripts/ci-trusted`. Never fetch or run it; report it to team-lead.
- `CI`: a trusted PR whose `local-ci` is failing, pending or missing, with the state on the line. A failing one can still need a verdict; a pending one is listed but does not wake a `--wait` or keep a `--drain` open, since its CI will finish and it will move to `READY`.

Lines are `<GROUP> [<repo>]#<n> <short head> <branch>: <title>`, grouped in that order, oldest number first. With no flag it prints the queue and exits 0, or exits 3 when nothing waits. `--wait` blocks until something needs a look (anything but a pending CI) and then prints all of it. `--drain` stays up, prints each PR (at a head) the first time it appears, and exits 0 only when none needs a look, so a reviewer that keeps it in the background is woken by the end of the queue, not by its first entry. `--repo owner/name` (repeatable) looks in other repositories, such as the site's, with the repo named on each line. `--interval` is seconds between looks (default 60); `--timeout` gives up a wait with exit 4. Exit 2 is bad options or a failing `gh`.
