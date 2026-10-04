---
tool: `scripts/pr-status.sh`
section: pr
covers: scripts/pr-status.sh
---
One live row per open PR: merge state, what holds it (`awaiting-user`, draft), review verdict and local-ci for the current head, any failing check, and the owner and current ask (`scripts/pr-owner.sh`); then the issues awaiting the user. The rows come from the shared PR snapshot (`scripts/tools/pr-snapshot.mjs`, up to a minute or two old), else `gh pr view` per PR. Check it before reporting on or acting on a PR, and don't build on a held item. Anything waiting on a user decision gets the `awaiting-user` label (a PR also stays a draft).
