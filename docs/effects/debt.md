<!-- Generated from src/data and src/sim/balance.js by `npm run effects`. Do not edit by hand. -->

# Comprehension debt

Code nobody quite understands, from 0 to 100. Paydowns take a share of the current debt, so it settles where inflow and paydown meet.

## What adds it

| Source | Adds a week |
|---|---|
| A builder on a new product, update, migration or research | 0.12 × 1.6 (junior) / 1 (mid) / 0.4 (senior); ×1.5 under Crunch Mode |
| Engineering automation | 0.8 × level (half with no project running) |
| QA and ops automation | 0.35 and 0.3 × level |
| Each live product | +0.04 |
| Know-how under 40 | 0.03 per point under |

## What pays it down

| Paydown | Takes off a week |
|---|---|
| Code Comprehension Reviews | 2.7% of the debt |
| Each senior engineer | 0.4% of the debt × their knowledge / 100 (Architects ×1.4) |
| Each engineer on maintenance | 0.2% of the debt |

## All at once

- Someone leaves: 0.12 × their knowledge (Docs Culture research cuts it).
- The Big Refactor ships: 60% of the debt is cleared.
- Some choices add or remove a few points; the Decisions page lists them.

## What it does

- Security posture -0.5 per point of debt.
- Rogue agent risk × (1 + debt / 50), and over 60 a rogue incident hits one level harder.
- The fixing capacity an outage needs × (0.4 + debt / 100): past what your people can fix, the outage is unrecoverable.
- The tech lead speaks up at 30 / 50 / 70. Code Comprehension Reviews unlock at 20 or on the Office Floor.
