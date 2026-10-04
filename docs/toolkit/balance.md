---
tool: `npm run balance -- --seeds N [--bots a,b] [--start-era preinternet|dotcom|web2|classic|chatgbt|agents|consolidation|plateau] [--jobs N] [--set path=value] [--json out.json] [--baseline classic.json]`
section: sim
who: sim, reviewer
covers: scripts/balance.js
---
Seeded bot games with a win and exit table, plus era by era arrival stats. Use paired runs on the same seeds to compare two builds.

`--start-era` founds every bot company in that era (default Classic). `--json` writes one compact result per bot and seed, with a SHA-256 of its full final state. `--baseline` reads that output and prints the existing paired-report table, including lost/gained exits, scores, weeks and incidents. Seed sets must match; bad era/bot/seed arguments, unreadable baseline files and mismatched seed sets exit 2. A run stopped before completion does not write a partial JSON result. The baseline file may come from a different checkout that supports these options; use `scripts/events/pair.js` when comparing with an older checkout's default run.

`--jobs N` runs up to N bots at once in worker threads; the results and JSON are identical to a single-thread run. `--set path=value` (repeatable) overrides one number in `B` for the run, for sweeps before editing `balance.js`: `--set eraStarts.plateau.exitMrrMult=0.55`. A path that is not a number in `B` exits 2. The summary line under the main table gives the pooled median score over every bot and seed, and the same median before the start's era factor, which is what an era start's `scoreMult` and `scoreShare` are calibrated from.

Run Classic with `--seeds 200 --json classic.json`, then each other era with `--seeds 200 --start-era agents --json agents.json --baseline classic.json`. All differences in these comparisons include the kit and era choice; they are not estimates of one mechanic's effect.

Historical careers include their saved early chapters before the twenty-year modern checkpoint. Bots keep their strategies. Read first-launch and ending-reason columns alongside exit percentages.

`pastOpening` counts runs that passed the pre-internet chapter's 156 playable weeks (three company years). The arrival table includes pre-internet, dot-com, Web 2.0 and Classic as well as the AI eras. Boxed-product bots order paid batches through the same actions as players and mail patches for damaged releases; installed copies are separate from their service MRR.
