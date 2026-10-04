---
tool: `npm run balance -- --seeds N [--bots a,b] [--start-era preinternet|dotcom|web2|classic|chatgbt|agents|consolidation|plateau] [--start-mode garage|takeover] [--jobs N] [--set path=value] [--json out.json] [--baseline classic.json]`
section: sim
who: sim, reviewer
covers: scripts/balance.js
---
Seeded bot games with a win and exit table, plus era by era arrival stats. Use paired runs on the same seeds to compare two builds.

`--start-era` founds every bot company in that era (default Classic). `--json` writes one compact result per bot and seed, with a SHA-256 of its full final state. `--baseline` reads that output and prints the existing paired-report table, including lost/gained exits, scores, weeks and incidents. Seed sets must match; bad era/bot/seed arguments, unreadable baseline files and mismatched seed sets exit 2. A run stopped before completion does not write a partial JSON result. The baseline file may come from a different checkout that supports these options; use `scripts/events/pair.js` when comparing with an older checkout's default run.

`--jobs N` runs up to N bots at once in worker threads; the results and JSON are identical to a single-thread run. `--set path=value` (repeatable) overrides one number in `B` for the run, for sweeps before editing `balance.js`: `--set eraStarts.plateau.exitMrrMult=0.55`. A path that is not a number in `B` exits 2. The summary line under the main table gives the pooled median score over every bot and seed, and the same median before the start's era factor, which is what an era start's `scoreMult` and `scoreShare` are calibrated from.

`--start-mode takeover` runs the sensible predecessor from Classic to the selected ChatGBT or Agents era before the measured bot takes over. The default `garage` keeps ordinary founding. JSON `weeks` remains company age; `elapsedWeeks` excludes the inherited history. Takeover retains original funding and applies `B.takeover.scoreMult`, with no era kit. Unsupported mode/era combinations exit 2. A predecessor that does not reach the requested era fails the run without exporting partial results.

The takeover table includes inherited launches and office milestones. Era arrival rows cover the entry era and subsequent play; incident totals and ending scores include the inherited company history. Use `playedWeeks` for time under the measured bot and `weeks` for company age.

The sensible predecessor is player-facing game content. Changes to its bot strategy or balance need a paired `--start-mode takeover` comparison in both supported eras on the same 200 or more seeds, plus re-measurement of the score shares. A change to any calibration bot also requires re-measuring the pooled shares. Calibrate takeover factors with all six bots on seeds 1 through 200, equally weighted, using the upper middle score of each sorted 1,200-run pool (the pooled line's "before the era factor" figure at the current factor gives it directly). Divide `scoreShare * Classic pooled median` by the takeover pooled median at factor 1, round the factor to two decimals, then re-run with that factor to verify the measured share against its target. `B.takeover.scoreShare` holds the targets, three quarters of the same era's garage share. Balanced and sensible share the predecessor's base strategy, so their rows are continuity diagnostics rather than independent managers; include them in the pool to keep the same definition as garage shares. Strip predecessor bot memory before handing the company to its new manager.

Run Classic with `--seeds 200 --json classic.json`, then each other era with `--seeds 200 --start-era agents --json agents.json --baseline classic.json`. All differences in these comparisons include the kit and era choice; they are not estimates of one mechanic's effect.

Historical careers include their saved early chapters before the twenty-year modern checkpoint. Bots keep their strategies. Read first-launch and ending-reason columns alongside exit percentages.

`pastOpening` counts runs that passed the pre-internet chapter's 156 playable weeks (three company years). The arrival table includes pre-internet, dot-com, Web 2.0 and Classic as well as the AI eras. Boxed-product bots order paid batches through the same actions as players and mail patches for damaged releases; installed copies are separate from their service MRR.
