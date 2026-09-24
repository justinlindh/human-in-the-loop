---
name: playtest
description: How to run, screenshot, and playtest Human in the Loop, both headless (npm run snap) and in the real Chrome browser. Use when verifying any visual or UI change, when asked to playtest, or before reporting work done.
---

# Playtesting Human in the Loop

## Headless screenshots (builders use this)

```bash
npm run snap -- --scenario floor --out shots/floor.png
npm run snap -- --scenario hq --time night --width 1024 --height 640 --out shots/hq-night-small.png
npm run snap -- --real --seed 1 --weeks 40 --out shots/real-w40.png
```

- Scenarios: `garage`, `floor`, `hq`, `incident`, `night`. `--real` runs the actual sim instead of the mock.
- The tool exits non-zero if the page logged any console error, and prints them. A red exit is a failed check, not a flaky tool.
- After snapping, **Read the PNG**. A screenshot you did not look at verifies nothing.
- Headless uses software WebGL (swiftshader): fine for correctness and composition, meaningless for frame rate.
- Each worktree runs its own server; if 5173 is taken the tool starts Vite on a free port. Do not kill other agents' servers.

## Real browser (reviewer and lead only)

Only the reviewer and the lead drive Chrome, so agents do not fight over the one browser.

1. `npm run dev` in the worktree under test (note the port).
2. Open a new tab (never reuse the user's tabs); navigate to `http://localhost:<port>/?seed=<n>`.
3. Record a GIF for multi-step flows worth showing the user.
4. Read console messages filtered to errors after each major step.
5. Do not trigger `alert`/`confirm` dialogs; the game has none, and if one appears that is a bug.

`window.__HITL` in dev builds exposes `{ state, dispatch, setSpeed, tickN(n) }` for fast-forwarding and setting up situations (for example `__HITL.tickN(200)` to jump ahead, or dispatching `setAutomation` to force a scenario).

## Playtest script

1. New game. Can a first-time player tell what to do within 30 seconds? Note confusion.
2. Build a first product with the founders, launch it, run a launch campaign.
3. Hire a junior and a senior; pair them as mentor and mentee.
4. Push engineering automation to 100% for a year of game time. Watch meaning, debt, incidents. Does it feel dangerous before it is fatal? Are the warning signs visible in the office and not only in numbers?
5. Pull back, turn on Pair and Code Comprehension Reviews, recover. Does recovery feel possible and rewarding?
6. Reach the Office Floor. Trigger or wait for an incident; resolve a decision.
7. Fast-forward to an ending (win or lose) and read the epilogue.
8. Repeat step 1 at 1024x640.

## Report format

- Bugs: severity, steps, expected versus actual, screenshot path, console output.
- Feel: moments that were fun, boring, confusing, or unfair.
- Top three changes that would most improve the game.
