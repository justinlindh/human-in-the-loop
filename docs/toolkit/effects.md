---
tool: `npm run effects [-- --check]`
section: sim
who: sim, reviewer, all
covers: scripts/effects.mjs src/sim/effects-report.js src/data/effects-map.js
---
Regenerates `docs/effects/`, the report of how every policy, decision, office item, role, trait, product option, channel, research and advisor topic changes the game, from `src/data` and `src/sim/balance.js`. Run it after changing data or a balance value; `tests/effects.test.js` fails while the report is stale. `--check` writes nothing, names the files that differ and exits 1. A rule that lives in code is described through `src/data/effects-map.js`, which names the balance values behind it; a new policy, event subject or requirement needs an entry there.
