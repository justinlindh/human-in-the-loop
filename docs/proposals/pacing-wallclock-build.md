# Pacing on the wall clock: build plan

The PR sequence for `pacing-wallclock.md` (issue #1639). Each step names its owning lane, what it changes and the measured target it must hit before it merges. Nothing here starts until the owner approves the proposal. That approval covers steps 1 to 5, so they ship as normal PRs. A step that departs from the approved budget goes back to the owner as a draft with `awaiting-user`.

"Human policy" below means `scripts/pace.js --browser` with the reading policy from step 0 (`--wpm 200 --choose 4 --menu-seconds 10`, prompts and mail left visible). Until step 0 lands, a step's evidence is the bot run re-timed as in the proposal's section 1, and its PR says so.

Baseline (main, seed 1, the first 30 min): at 1x, 54% of wall time paused at human timing, a mean of 21 s of play between things needing an answer, and up to 4 open at once. At 4x, 84% paused and 4 s between asks.

## Revert switches

Every change ships behind its own boolean in `B.pacing` (`src/sim/balance.js`). Each defaults to `true`, and turning one to `false` restores today's behaviour for that part alone. sim adds the whole block in step 1, so every lane reads its switch from the start; a switch whose step has not merged yet does nothing.

Each PR that adds a switch also adds a test: with the switch off, its part behaves exactly as it does on main. For a sim switch, that means a bot run over a fixed set of seeds is identical to main. For a ui or art switch, it means a DOM or render test of the old path.

| Switch | Step and lane | On | Off (today) |
|---|---|---|---|
| `askQueue` | 1 sim, 2 integrator | Decisions, Yak prompts and letters go through one queue, one open at a time, at least 90 s of running play apart, with 45 s of quiet after a modal | Three separate slots on game-week gaps (`decisionGapWeeks`, `chatPromptsOpen`, `mail.actionOpen`) |
| `askExpiry` | 1 sim, 2 integrator | A non-emergency ask that waits 3 min resolves to its default, with one Yak line. At most `queueCap` (3) wait; when another arrives, the least pressing, oldest one expires at once | Nothing expires, and the queue has no cap |
| `askRealTime` | 2 integrator | The ask gaps and the expiry are fixed in real seconds at every speed, so 4x shows the same asks per minute as 1x | The gaps shrink with speed (gap seconds ÷ speed), so 4x asks four times as often |
| `momentCap` | 2 integrator | At most one staged moment per 5 min, holding the clock at most 25 s; music night plays without holding it | Today's spotlight holds and caps |
| `askRates` | 3 sim | The event and prompt chances are retuned to about 0.5 to 0.7 candidates per running minute | Today's `randomEventChance` and `chatPromptChance` |
| `letterMail` | 3 sim | No flavour mail; mail is only outside letters with a real choice; reply-all is a Yak gag | Today's inbox rolls, templates and reply-all storms |
| `quietEvents` | 3 sim | The office gags (ping-pong, printer, pet) are ambient with no choice; incidents below severity 3 resolve ambiently; music night picks its genre | They stay decisions |
| `quietToasts` | 4 ui | Game-started toasts at least 30 s apart and merged by subject; info and good ones dropped after 30 s waiting; warnings first; status news goes to the world, not a toast | Today's toast budget and status toasts |
| `oneLaunchCard` | 4 ui | One card per launch with no toast; two launches within 60 s share a card | Toast plus card for each launch |
| `unlockPips` | 4 ui | Unlocks show a "New" pip and one toast; a card only for a new system or an era | An unlock card each time |
| `advisorGlow` | 4 ui | No peek card; the advisor button glows | The peek card |
| `quietYak` | 4 ui | Flavour posts at least 20 s apart, with no unread badge for flavour | The 6 s Yak gap and today's badge |
| `mailArchive` | 4 ui | The envelope is an archive with no unread count for anything already shown; a letter has its own card | Today's inbox panel and badge |
| `deskBubbles` | 5 art | The status news `quietToasts` takes off the toast stack shows as desk bubbles and floating text | No status bubbles. With `quietToasts` off the news stays a toast and art draws nothing extra, so the two switches never show the same news twice |

`ui/spacing.js` folds into the attention clock under `askQueue`. With `askQueue` off it runs as it does today.

## Step 0. Measure at human speed (tools, #1642: `scripts/pace.js`, `scripts/pace-browser.js`)

- `--wpm N --choose S`: the player's dwell on any surface is `words(text) / N * 60 + (actionable ? S : 0)`, replacing the flat 8 s and 6 s.
- `--visible-asks`: the player leaves Yak prompts and mail on screen and answers them through the UI after their dwell, instead of inside its weekly turn. It opens the inbox when a mail arrives.
- `--menu-seconds N`: the player spends N seconds per running minute in its management panel.
- `--era <id>` and `--load <save>`: start in an early era or from a stored game.
- The report gains `pausedShare`, `asks` (decision, prompt and mail with a choice, as one series), the gaps between asks in running seconds, the longest stretch of running play with no game ask, and the most asks open at once.

**Target:** on unchanged main, the human policy at 1x reproduces the re-timed estimate within 10% (about 55 min for 189 weeks, about 54% paused). The run and its parity with the estimate go in the PR.

## Step 1. The ask queue (sim: `src/sim/`, `src/save/`, `tests/`; contract change through team-lead)

Switches: adds the whole `B.pacing` block. `askQueue` and `askExpiry` land `false` here, because nothing presents asks in the browser until step 2. Step 2 turns them on. Every other switch lands `true` and does nothing until its own step merges.

- `state.asks`: candidates, each with an id, kind (`decision`, `prompt` or `letter`), priority (`emergency`, `normal` or `low`), created week, expiry and default choice.
- `raiseDecision`, `openEventPrompt` and actionable mail append a candidate when `B.pacing.askQueue` is on. Off, they behave exactly as today.
- `B.attention` holds the real-second numbers that step 2 reads: the 90 s gap, the 45 s quiet, the 3 min expiry, the 5 min moment window and the 25 s moment cap. It also holds four week-based keys:
  - `staleWeeks`: a candidate past it no longer fits the game and is dropped silently, with no default applied.
  - `botGapWeeks` (11): bots present the head this long after the last presentation. Emergencies come at once.
  - `botExpiryWeeks` (22): with `askExpiry` on, a waiting non-emergency ask expires after this in bot runs, and its default applies.
  - `queueCap` (3): with `askExpiry` on, the most non-emergency asks that can wait.
- Emergencies are incident and cyber decisions; they never expire. The rest are normal (other decisions) or low (prompts and letters).
- The expiry default is the event's `defaultChoice`, else its entry in `src/data/ask-defaults.js` (new), else its choice with no effect. A prompt or letter takes its ignore outcome. A test fails for any decision that can expire without one.
- New actions: `{ type: 'presentAsk', askId? }` turns the head candidate, or the named one, into `pendingDecision`, a prompt or a letter. `{ type: 'expireAsk', askId }` applies the default and emits one ambient Yak line.
- `runBot` and the balance bots present from the queue on `botGapWeeks` and `botExpiryWeeks`, so balance runs never depend on the wall clock.
- Save migration for `asks`.

**Targets:** with `askQueue` off, `npm run balance -- --seeds 200` is identical to main. With it on in bot runs, endings move by no more than the paired-run noise over 200 seeds, and the paired table goes in the PR.

## Step 2. The attention clock (integrator: `src/pacing.js`, `src/main.js`)

Switches: `askQueue`, `askExpiry`, `askRealTime` and `momentCap`. This PR sets `askQueue` and `askExpiry` to `true` in `src/sim/balance.js`, with sim's agreement through the lane exception.

- A pure `createAttention()` in `src/pacing.js` works on running real seconds. It holds the 90 s minimum gap between asks, the 45 s quiet after any modal or beat, at most one staged moment per 5 min, and the 3 min expiry for any ask that isn't an emergency. Emergencies jump the queue but still wait out the quiet. The `queueCap` expiry happens in the sim when an ask arrives, not on the clock. The numbers live in `B.attention`, which sim adds in step 1.
- `main.js` dispatches `presentAsk` and `expireAsk` from it.
- The spotlight hold cap drops to 25 s, and music night stops holding the clock (`momentCap`).
- Every gap is fixed in real seconds at any speed (`askRealTime`). Only the economy scales with speed.

**Targets, human policy, 30 min:** at 1x and 4x alike, the gap between asks is never under 90 s of running play, with a mean of at least 150 s. There is at most one ask open at a time, and in every 10 min there is at least one 180 s stretch with no game ask. At 4x the asks per real minute stay within 10% of the 1x rate.

## Step 3. Cut the candidate rate (sim: `src/sim/balance.js`, `src/data/`, `src/sim/`)

This builds on draft #1641. Switches: `askRates`, `letterMail` and `quietEvents`. Each one off restores today's numbers or content for its part.
- Flavour mail goes (`mail.ambientChance` 0).
- Mail keeps only outside-world letters with a real choice: acquisition, investor, poaching, legal, a rival's pitch.
- Reply-all becomes a Yak and bubble gag.
- `randomEventChance` and `chatPromptChance` come down until the sim proposes about 0.5 to 0.7 candidates per running minute at 1x.
- The repetitive office gags (ping-pong, printer, pet) become ambient events with no choice.
- Incidents below severity 3 resolve ambiently.
- Music night picks its genre without asking.

**Targets:** in the sim emit probe over 5 seeds and Classic weeks 0 to 1040, candidates come at 0.5 to 0.7 per running minute and letters at 0.12 to 0.2, with flavour mail at 0. A dot-com start lands within the same bands. Under the human policy at 1x, fewer than 1 in 5 asks expire. Paired balance runs over 200 seeds show endings within noise, or the shift is listed as a change to how the game plays.

## Step 4. Quiet the interface (ui: `src/ui/`, `src/audio/`)

Switches: `quietToasts`, `oneLaunchCard`, `unlockPips`, `advisorGlow`, `quietYak` and `mailArchive`. These may land as more than one PR.

Before step 5 starts, ui writes the **bubble spec**: which status news leaves the toast stack under `quietToasts`, and the shape of the ambient event art draws (type, subject id, short text, an icon id and a tone). ui posts it on the step 4 issue.

- **Toasts:** game-started toasts at least 30 s apart and merged by subject. An info or good toast that has waited 30 s is dropped silently, with no "+N more" counter. Warnings go first and never drop. Only money, staff changes, goals and player-caused feedback stay as toasts. Status news (three-quarters done, back from vacation, trends) becomes an ambient event for step 5.
- **Launches:** one card per launch, with no toast for the same news. Two launches within 60 s share one card.
- **Unlocks:** a "New" pip on the build or policy menu plus one toast. A card only for a whole new system or an era.
- **Advisor:** drop the peek card; the button glows instead.
- **Yak:** flavour posts at least 20 s apart, and no unread badge for flavour. The dock lights only for #incidents and #wins.
- **Mail:** the envelope becomes an archive with no unread count for anything already seen. A letter gets its own card look and the envelope sound.
- `ui/spacing.js` folds into the attention clock from step 2, so cards and asks share one budget.
- Everything works on touch, with nothing hover-only.

**Targets, human policy, 30 min, at 1x and 4x:**
- Game-started toasts: at most 2 per real minute.
- Yak flavour: at most 2 per real minute, with every important post shown.
- Beats (cards and staged moments): at most 0.3 per real minute.
- Wall time under a modal: at most 8%.
- Wall time paused, menus included: at most 25%.

## Step 5. Show it in the world (art: `src/render/`)

Switch: `deskBubbles`. This step starts from ui's bubble spec.

- Desk bubbles and floating text over the subject replace the status toasts: progress, back from vacation, trends, small incidents as a red bubble, and reply-all as a gag.
- They follow the existing bubble pacing, so the speech bubble checks still pass.
- They degrade under the Low quality setting to an icon with no text.

**Targets:**
- The sweep and stage specs pass.
- `npm run snap` shows no console errors.
- The perf gate is unchanged on Low.
- Under the human policy, nothing new pauses the clock: paused share stays within one point of step 4's.
- The PR has a clip of a 3-minute stretch with no game ask that still reads as a living office.

## Order and merging

- **Step 0 first.** Every later step needs it for its evidence.
- **Steps 1 and 3 can run in parallel** on separate sim branches. Step 3's mail and event cuts don't need the queue and can merge first if the owner wants a quick win.
- **Step 2 needs step 1.** Steps 4 and 5 can start alongside step 2 and merge after it.
- **Docs in the same PR:** each step updates `docs/features/` for what the player sees, and `docs/toolkit/pace.md` for the new flags in step 0.
