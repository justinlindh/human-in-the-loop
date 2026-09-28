---
tool: `node scripts/pace.js ...`
section: sim
who: sim, integrator
covers: scripts/pace.js
---
Plays the real sim through the pacer with a simulated player and reports what a person would see, and when, in real time.

Reports `spotlight.count`, `skipped`, `byKind`, and `addedSeconds`/`addedMinutes` in JSON, plus a summary line. These are presentation estimates from the render lane's `src/render/spotlight-kinds.js`, not browser measurements: travel, absent actors, manual skips and player camera input are not simulated. Only spotlight time outside decisions and menus counts as added time. At 4x scenes are counted as skipped. `--no-spotlights` removes modelled holds for comparison; `--weeks 1040 --seed 1 --speed 1` models a full run.

Tagged `say.moment` lines leave the weekly pacer immediately. Their reading order and scene timing belong to the renderer, which keeps them moving while a decision or spotlight holds the sim clock; use a real-game capture to judge those bubbles.

Yak chats go through `src/yak-pacing.js` as in `main.js`: chats from the player's own actions and open prompts show at once (logged `urgent: true`), the rest wait out the Yak reading gap, and `chat.omitted` counts the lines the Yak pacer dropped. Chats the weekly pacer drops are never shown, as in the game.

Important Yak posts (incidents, #wins, or flagged `important`) report how many were queued and how many were shown (the rest expired or were still queued), their longest wait, in seconds the Yak pacer was running, and how many are still queued when the run ends: `chat.important` in JSON (`queued`, `shown`, `longestWaitSeconds`, `queuedAtEnd`), the "important posts" summary line, and two `--check` targets (at most 90 s, at most 15 queued) that hold at any speed.
