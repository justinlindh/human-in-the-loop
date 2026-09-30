---
tool: `npm run balance -- --seeds N [--bots a,b] [--start-era dotcom|classic|chatgbt|agents] [--json out.json] [--baseline classic.json]`
section: sim
who: sim, reviewer
covers: scripts/balance.js
---
Seeded bot games with a win and exit table, plus era by era arrival stats. Use paired runs on the same seeds to compare two builds.

`--start-era` founds every bot company in that era (default Classic). `--json` writes one compact result per bot and seed, with a SHA-256 of its full final state. `--baseline` reads that output and prints the existing paired-report table, including lost/gained exits, scores, weeks and incidents. Seed sets must match; bad era/bot/seed arguments, unreadable baseline files and mismatched seed sets exit 2. A run stopped before completion does not write a partial JSON result. The baseline file may come from a different checkout that supports these options; use `scripts/events/pair.js` when comparing with an older checkout's default run.

Run Classic with `--seeds 200 --json classic.json`, then each other era with `--seeds 200 --start-era agents --json agents.json --baseline classic.json`. All differences in these comparisons include the kit and era choice; they are not estimates of one mechanic's effect.

Historical careers include their saved early chapters before the twenty-year modern checkpoint. Bots keep their strategies. Read first-launch and ending-reason columns alongside exit percentages.
