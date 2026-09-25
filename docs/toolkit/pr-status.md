---
tool: `scripts/pr-status.sh`
section: pr
covers: scripts/pr-status.sh
---
One live row per open PR: merge state, what holds it (`awaiting-user`, draft), review verdict and local-ci for the current head, and any failing check; then the issues awaiting the user. Check it before reporting on or acting on a PR, and don't build on a held item. Anything waiting on a user decision gets the `awaiting-user` label (a PR also stays a draft).
