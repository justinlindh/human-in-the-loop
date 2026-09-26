---
tool: `node scripts/queue-dashboard/server.mjs --queue <queue-directory> --repos <owner/repo,owner/site> --host <bind-address> --port <port>`
section: pr
who: owner, integrator
covers: scripts/queue-dashboard/server.mjs scripts/queue-dashboard/model.mjs scripts/queue-dashboard/owner-command.sh scripts/queue-dashboard/app.js
---

A live dashboard for the local worker queue and owner decisions. Set `DASHBOARD_TOKEN` to a random access key of at least 24 characters. Runtime paths, the key and service configuration belong outside the repository. The default bind address is loopback; choose a LAN address or all interfaces only on a trusted network. This HTTP server is for local use, not direct public exposure.

Open the page with `#key=<access-key>` once to establish an HttpOnly session. The fragment is removed from the address bar and is not sent as a request URL. Subsequent requests use the session cookie. The server restricts Host headers, checks write origins and accepts only configured repositories.

Queue changes arrive through server-sent events, sampled every two seconds. GitHub refreshes every thirty seconds and failures retain the last successful snapshot. Checks, comments and delivery acknowledgements update without replacing the notes editor or playing media. A task file without a live systemd unit is marked interrupted and its activity is identified as historical. Session endings are distinguished from merged PRs. Worker activity includes public commentary and operation names, not private reasoning or raw command arguments; lookup crosses large tool-output records to find the latest public progress.

The decision inbox reads drafts and `awaiting-user` PRs, their descriptions, checks and attached media. Feedback is written as an owner comment using `/ship <reviewed-head>` or `/revise [head:<reviewed-head>] <notes>`. Hold records a comment without shipping. The existing owner-command worker must source `owner-command.sh`, dispatch by `owner_command_kind`, and reject `owner_command_head` when it differs from the current PR head. Its merge command must also use `--match-head-commit`. It must preserve unresolved technical review statuses when recording owner approval, and hold auto-merge when a review lookup fails. Do not enable approval controls with a consumer that ignores these gates. Notes containing command text must not change which action the consumer applies.

A successful submission means GitHub received the decision; the owner-command worker and required checks still control delivery. The dashboard does not bypass CI or merge directly. Unsent notes remain in the browser, including when a server restart requires signing in again. Request identities are journaled before an external write and restored on restart. A retry reconciles an exact existing comment even when the PR has moved or merged; only new writes require current eligibility. Conflicting actions or notes under the same request ID are rejected. The local feedback journal is under the configured queue's control directory.

Journal appends are serialized and flushed before a decision is sent. Only an absent journal starts empty. Startup rejects unreadable files, malformed or incomplete records and conflicting identities without discarding their contents. A failed append disables further journal writes until restart; restore a trustworthy journal before restarting. Do not delete damaged records to bypass recovery, since they may reserve an already submitted decision.

Run `node --test scripts/queue-dashboard/dashboard.test.mjs` for queue, activity redaction, feedback, authentication, stale-head, journal recovery and live-update checks.
