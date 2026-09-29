---
tool: `node scripts/tools/review-queue.mjs [--wait | --drain] [--interval s] [--timeout s] [--json]`
section: pr
who: reviewer, team-lead
covers: scripts/tools/review-queue.mjs tests/tools/review-queue.test.js
---
The pull requests waiting for a review verdict, all of them at once. A PR waits when it is open into main, not a draft, not held by `awaiting-user`, from the same repo by a login in `scripts/ci-trusted`, its `local-ci` is green on the current head, and no `review` verdict is on that head yet. It leaves the queue only when a verdict is posted on its head (or it is held, closed, or pushed to a head that has not passed local-ci); nothing is remembered between runs, so running it again returns whatever is still waiting, and a review that was started and not finished stays listed.

With no flag it prints the queue (`#<n> <short head> <branch>: <title>`, oldest number first) and exits 0, or exits 3 when nothing waits. `--wait` blocks until something waits and then prints all of it. `--drain` stays up, prints each PR (at a head) the first time it waits, and exits 0 only when none is left, so a reviewer that keeps it in the background is woken by the end of the queue, not by its first entry. `--interval` is seconds between looks (default 60); `--timeout` gives up a wait with exit 4. Exit 2 is bad options or a failing `gh`.
