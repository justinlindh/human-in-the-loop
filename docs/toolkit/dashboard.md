---
tool: `node scripts/dashboard/server.mjs --host <private address> [--port 8790]` (the hitl-dashboard service)
section: pr
who: all
covers: scripts/dashboard/server.mjs scripts/dashboard/collect.mjs scripts/dashboard/lib.mjs scripts/dashboard/dashboard.test.mjs scripts/systemd/hitl-dashboard.service
---
The owner's read-only view of the team, with no model calls, so it costs no tokens. It follows the system's light or dark setting, and a Theme button picks one, remembered in that browser. It shows:
- each agent's newest tool call, with its one-line description, scrubbed of anything that looks like a secret and cut to 80 characters;
- local CI: auto CI's runs and their last step, slots, load, the quiet window, the render hold and the main guard;
- open PRs with every check;
- token use per teammate over 5 hours (from `scripts/usage-lib.mjs`);
- worktrees.

Serving and refresh:
- **Refresh:** every 30 s, with usage and dirty worktrees every 5 minutes.
- **Bind:** one private address (loopback, 10/8, 172.16/12, 192.168/16 or 100.64/10), never a wildcard. It answers only GET requests from those ranges: `/` and `/state.json`.
- **Install:** `scripts/systemd/install.sh` runs it as a user service from auto CI's worktree, on this machine's private address. `HITL_DASH_HOST` overrides the address, and the installer prints the URL.
- **Tests:** `node --test scripts/dashboard/dashboard.test.mjs` checks the bind rule, the source ranges, the scrub, the log reading, and that the server refuses a wildcard and answers only reads.
