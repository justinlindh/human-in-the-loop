---
name: balance-tuning
description: How to measure and tune Human in the Loop's game balance with the headless bots. Use when the balance test fails, when numbers in src/sim/balance.js change, or when a playtest says something feels too easy, too hard, or pointless.
---

# Balance tuning

## The targets

Asserted in `tests/sim/balance.test.js` (40 seeds per bot):
- `automateAll` loses in at least 70% of seeds. Automating everything must be a trap.
- `allHumans` fails to win in at least 70% of seeds. Refusing AI must be a slow death too.
- `balanced` wins in 30% to 90% of seeds. Doing it right should be winnable but not guaranteed.

Beyond the assertions, a good run also has: first launch within 10 to 25 weeks; Office Floor reachable by years 2 to 4 for balanced; automateAll feels great for 1 to 3 years before it collapses (the trap has to be tempting); losses by collapse, not only by runway, for automateAll.

## Loop

1. `npm run balance -- --seeds 100` and read the table: win %, loss reasons, median weeks, median peak MRR, median score.
2. Diagnose which property is off before touching numbers. Ask: is the bot playing wrong, or is the game wrong? Fix obviously broken bot logic first.
3. Change one lever (or one tightly related pair) in `src/sim/balance.js`. Re-run. Keep notes in your scratchpad, not in source.
4. When all targets hold at 100 seeds, run `npm test`, then commit with the final table in the commit message.

## Levers, in the order to try them

| Symptom | Levers |
|---|---|
| Everyone goes broke early | `startCash`, `salary`, `acquisitionRate`, `sizes.*.cost` |
| Everyone wins easily | `ipoMrr`, `incumbent strengths` (data), `cloneChanceYearGrowth`, `expectationGrowth` |
| automateAll survives | `debtFromEngAuto`, `rogueBase`, `outageCollapseWeeks`, `debtLowIkRate`, `postureDebtPenalty` |
| automateAll dies too fast (not tempting) | `autoEngPoints` up, `rogueShortfallFloor` down, `debtFromEngAuto` down slightly |
| allHumans wins | `autoEngPoints` up (AI productivity must matter), `pointsGrowthPerYear`, `expectationGrowth`, `salary` |
| balanced loses to attrition | `meaningDrain`, `resignChance`, `pairMeaningDrainMult`, recovery bonuses |
| Marketing does not matter | `hypeAcquisition`, `wrapperChurn`, brand terms in appeal |

Never tune by editing formulas inside systems to hit a number; if a formula is wrong, fix it deliberately and say so in the commit.
