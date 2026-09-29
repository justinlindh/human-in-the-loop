---
tool: `node scripts/pace.js ...`
section: sim
who: sim, integrator, reviewer, ui
covers: scripts/pace.js scripts/pace-browser.js scripts/pace-browser.test.mjs
---
The default mode plays the real sim through a presentation model with a simulated player. Its elapsed time and presentation counts are estimates. `--browser` instead observes the real browser UI on an unaccelerated wall clock, through the shared Chromium launcher and render lock used by `drive.mjs`.

## Observed browser mode

```bash
timeout 3300s nice -n 10 node scripts/pace.js --browser \
  --seed 1 --speed 1 --bot sensible --weeks 156 --minutes 50 \
  --sample-minute 5 --out shots/pace-browser
```

Starts a fresh seeded game at week zero. The normal game loop advances weeks, including its menu, decision and spotlight pauses. It never calls `tickN`, installs a virtual clock, or injects a later save. `--speed` accepts 1, 2 or 4. `--minutes` caps elapsed run time (default 60); `--weeks` stops at the requested week (default 156). The output names the actual stop reason, including game over. Startup and render-lock waiting are outside the measured exposure. `--size laptop` accepts the shared drive viewport names or `WxH`; quality is Low. Use `--out` to give each run its own artifact directory.

The browser player runs the chosen bot's management turn two seconds after each new week, once cards clear. Decisions get eight seconds of reading before the bot chooses. Other cards get six seconds before dismissal. This policy has no simulated menu dwell. Bot actions use the real sim and route their events through the game UI. It answers Yak prompts as part of weekly management, including prompts outside the visible channel. These are automated browser observations under this policy, not human-play rates. Modeled-only flags (`--player`, `--week-seconds`, `--frame`, `--no-spotlights`, `--check`, `--milestones`) are rejected.

`observed.json` contains `elapsedSeconds`, `weeks`, `stop`, errors, per-kind `rates`, and structured `records`. Every record carries elapsed seconds `t`, `week`, `era`, numeric `officeStage`, `kind`, `id`, `actionable`, enabled `actions`, `origin` (`game` or `player`), a presentation `sequence`, and `transition` (`shown`, `hidden`, or `updated`). Hidden Yak prompts include their resolution when available. IDs use decision, toast, chat, prompt, advisor and office-promotion identities; panels and information cards use their visible headings. Yak retains `rootId`, `replyTo`, and `opportunity` (`reply`, `reaction`, or null). A reply prompt also records its `chatId`.

Counts are **visible presentation episodes**, sampled every 100 ms plus browser/capture overhead. A row must intersect the viewport and its scroll containers, and have visible CSS. Queued or held toasts, unselected Yak channels, clipped posts, hidden panels and decorative reaction totals do not count. A surface that leaves and returns counts again, with its stable ID and a new sequence; DOM rebuilds and a toast moving directly into its dock do not create another presentation. `updated` records track actionability changes without inflating presentation rates. The reader checks rectangular visibility, not pixel occlusion by another overlay, and can miss surfaces shorter than a sampling interval. Partial rows may count before all their controls are visible.

Kinds are `decision`, `toast`, `yak`, `yak-prompt`, `advisor-prompt` (a peek or visible advice row), `office-prompt` (the Needs you office move row), `panel`, `card`, and `tutorial`. Yak and its reply prompt overlap, as do advisor panels and their prompts. Do not sum them into required actions. Optional reaction controls count only when actually enabled and visible; the game's reaction totals are decorative. Rates divide `shown` counts by the entire observed elapsed exposure, including pauses, and split player/game origin and actionable counts.

Origin follows synchronous player callbacks and bot events, with metadata carried through the toast queue and Yak delivery. It is not inferred from proximity to a click. Game announcements stay game-origin even when a player dismissal lets the next queued announcement appear. Panel follow-through from a toast, advisor or announcement button is player-origin. The Vite plugin attaches identities and provenance only for this measuring session; it does not edit or ship game files, and fails if its source hooks no longer match.

A missing metadata hook reports the source file, the expected source line, and the instruction to update `scripts/pace-browser.js`. When a UI refactor moves that line, update the corresponding `presentationMetadata` rule to match the UI source and preserve its measurement metadata. Run `npx vitest run tests/tools/pace-browser.test.js` and the browser controls below to verify the hook and presentation behavior.

`--sample-minute N` (one-based, default 2) takes a full screenshot whenever the sampled surfaces change in that minute. `sample.frames` links each frame to the active and newly shown record sequences. A screenshot is taken immediately after each observation, while the real clock keeps running, so its capture can lag the observation. Inspect the frames, compare newly visible rows with the `shown` records in the half-open minute, and make a sheet with the existing `scripts/sheet.sh grid`. This is a visual cross-check, not an independent sensor. `progress.json` is a periodic checkpoint; the complete trace is written on normal completion. Interrupted runs must not be reported as complete.

Browser controls: `timeout 120s nice -n 10 node scripts/pace-browser.test.mjs`. They exercise real toast queuing/redocking, action origin, visible/hidden and clipped surfaces, Yak actionability and resolution, and missing metadata hooks under the shared render lock.

An explicit `--weeks` target that hits the elapsed cap first writes its partial report and exits nonzero. `--json` also prints the complete report to stdout; launcher/progress diagnostics go to stderr. Actionable counts include a presentation that gains an enabled action after first appearing, once per presentation sequence.

Panel coverage includes management and advisor dialogs, the automatic incident card and remote-call grid, and maximized Yak. Information cards include launch/announcement cards and the end-of-run card. A toast group's `+N more` counter is not N visible toasts; only individual toast text actually presented in the stack or dock counts.

The decision policy uses the existing bot's `botDecide`: after reading a visible decision it can resolve a chain of follow-up decisions in the same turn. Follow-ups that never reach the UI are not presentations. The browser player does not voluntarily browse management panels or switch Yak channels, so its panel and actionable-Yak rates depend on that viewing policy.

## Modeled mode

Reports `spotlight.count`, `skipped`, `byKind`, and `addedSeconds`/`addedMinutes` in JSON, plus a summary line. These are presentation estimates from the render lane's `src/render/spotlight-kinds.js`, not browser measurements: travel, absent actors, manual skips and player camera input are not simulated. Only spotlight time outside decisions and menus counts as added time. At 4x scenes are counted as skipped. `--no-spotlights` removes modelled holds for comparison; `--weeks 1040 --seed 1 --speed 1` models a full run.

Tagged `say.moment` lines leave the weekly pacer immediately. Their reading order and scene timing belong to the renderer, which keeps them moving while a decision or spotlight holds the sim clock; use a real-game capture to judge those bubbles.

Yak chats go through `src/yak-pacing.js` as in `main.js`: chats from the player's own actions and open prompts show at once (logged `urgent: true`), the rest wait out the Yak reading gap, and `chat.omitted` counts the lines the Yak pacer dropped. Chats the weekly pacer drops are never shown, as in the game.

Important Yak posts (incidents, #wins, or flagged `important`) report how many were queued and how many were shown (the rest expired or were still queued), their longest wait, in seconds the Yak pacer was running, and how many are still queued when the run ends: `chat.important` in JSON (`queued`, `shown`, `longestWaitSeconds`, `queuedAtEnd`), the "important posts" summary line, and two `--check` targets (at most 90 s, at most 15 queued) that hold at any speed.
