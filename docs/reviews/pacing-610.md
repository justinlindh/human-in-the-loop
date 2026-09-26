# Interaction pacing review: issue #610

Routine Yak prompts and repeated notifications deserve the first pacing experiment. Keep staged decisions as popups, keep the six trivial Yak events, and preserve the existing All / Important / Off setting. A blanket slowdown would lengthen quiet sections and leave same-tick bursts intact.

This is a measurement report and a proposal, not approval to change the game. Reference build: `51ec494f0a67389a2b0e1879275705537550aa62`. No game, contract, feature-inventory or toolkit changes are included.

## Existing work and ownership

The reviewer/playtest lane owns this report. Sim owns event cadence and balance constants, UI owns cards and notification presentation, and integrator owns the game clock and pacing tool. Art owns staged moments.

Issue #610 and every comment, plus its direct links #552, #557, #556, #608, #609, #575, #17 and #549, were read. Searches of open and merged PRs for #610, pacing titles, and local/remote branches found no completed general pacing review. [PR #727](https://github.com/justinlindh/human-in-the-loop/pull/727) is merged, with its earlier 300-seed balance and chatter measurements; its reduction in chatter is already in this baseline. [PR #575](https://github.com/justinlindh/human-in-the-loop/pull/575) retains six trivial event prompts. Issues #608 and #609 are closed: quieter Yak and reduced reactions are already present. [PR #557](https://github.com/justinlindh/human-in-the-loop/pull/557) and the follow-ups on #556 already address popup spacing. These should not be rebuilt.

## What the numbers count

- **Bot census:** 200 seeds each for sensible and balanced, up to 1,040 weeks or game over, counting tick events and events from player actions. Rates use observed weeks times 8 seconds, the nominal unpaused 1x clock. They are content supply per active minute, not human play-time rates. Pooling is weighted by exposure. Late eras contain survivors; they do not represent every starting company. Transition ticks are assigned to the preceding era/stage.
- **Browser samples:** sensible seeds 1, 2 and 3, two-minute windows in all five eras plus a separate Classic Office Floor window, at both 1x and 2x. There are 34 valid windows, 68 virtual minutes. Seed 2 immediately retires in Plateau at both speeds: those zero-exposure windows are excluded. Every other row has three seeds and six minutes per speed; Plateau has seeds 1 and 3 and four minutes. Classic is Garage then Floor, ChatGBT is Floor, and the remaining eras are HQ.
- The samples load ordinary seeded saves through Continue, use the real main loop, UI, renderer animation and timers, and advance the capture tool's clock at 30 fps. GPU drawing is skipped through the renderer's existing draw flag. These are automated runs at 1x/2x game speed, not live human playtests or visual-quality judgments. Saves start after the opening and after era arrivals, so onboarding and transition bursts are underrepresented.
- Decisions wait eight seconds before the bot resolves them; launch and announcement cards wait six seconds. Weekly management and Yak replies are automated without menu dwell. This makes these notification rates an upper-pressure sample for this management policy, not a prediction of human clicks per minute. The bot generates repeated campaign confirmations that a less active player may never produce.
- **Decision** means a popup presentation; **prompt** means a newly opened reply opportunity, which can expire without an answer. **Yak** means a paced arrival into any channel's UI store, not a post guaranteed to be visible in the selected channel. **Toast** means a displayed toast after the UI queue/budget, including confirmations of player actions. **Staged moment** means a kind entering the renderer's active cast, counted once across simultaneous actors. It is not every ambient animation, growth floater or party effect.
- Categories overlap. A prompt root is also a Yak arrival; its answer can generate a toast and replies. A moment may accompany a decision. Do not sum these columns into required player actions.

## Browser-loop rates per elapsed minute

At 1x:

| Era / office | Minutes | Decisions | Prompts | Yak arrivals | Toasts | Launch / other cards | Staged moments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| classic-garage | 6 | 0.5 | 1.33 | 7.67 | 3 | 0.33 / 0.5 | 0 |
| classic-floor | 6 | 0.83 | 3.83 | 19.5 | 14.33 | 0.17 / 0 | 0 |
| chatgbt | 6 | 1 | 1.33 | 10.83 | 9.5 | 0.33 / 0 | 0 |
| agents | 6 | 1.5 | 3 | 15.33 | 11 | 0.33 / 0 | 0.17 |
| consolidation | 6 | 1 | 2.67 | 14.17 | 13.33 | 0.67 / 0 | 0 |
| plateau | 4 | 1.25 | 3.25 | 14 | 14 | 0.5 / 0 | 0.25 |

At 2x, using the same initial saves and reading delays:

| Era / office | Minutes | Decisions | Prompts | Yak arrivals | Toasts | Launch / other cards | Staged moments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| classic-garage | 6 | 0.83 | 2 | 10.83 | 5.33 | 0.5 / 0.67 | 0 |
| classic-floor | 6 | 1.5 | 6.17 | 21.5 | 20 | 0.33 / 0.17 | 0 |
| chatgbt | 6 | 1.33 | 3 | 13.83 | 16 | 0.67 / 0 | 0.33 |
| agents | 6 | 2.33 | 4.33 | 16.5 | 18 | 0.5 / 0 | 0.17 |
| consolidation | 6 | 1.67 | 4 | 16.67 | 22.67 | 0.83 / 0 | 0 |
| plateau | 4 | 2 | 5 | 16.5 | 23.5 | 0.75 / 0 | 0.25 |

The largest 60-second window at 1x contained 43 combined popup/card, toast and Yak presentations, in Classic Floor. At 2x it was 57, also Classic Floor. Those are attention surfaces, not 43 or 57 required decisions.

The 1x Classic Floor sample contains 23 prompt openings in six minutes, all routine templates rather than the six migrated events. Their roots and direct replies account for 51 Yak arrivals, or **8.5/min of the 19.5/min total**. Across all 1x samples, 84 of 86 new prompts are routine templates. Increasing the set of event decisions moved to Yak would address the smaller stream and add to an already busy channel.

At 1x there are also 79 displayed confirmations saying “Conference Booth is live.” across 34 minutes, **2.32/min and 21.8% of all 363 displayed toasts**. These are consequences of the automated management policy, not unsolicited interruptions. Keep them separate when deciding which notifications to cut.

## Full-run bot census, per unpaused minute at 1x

| Era | Observed weeks | Decisions | Prompts | Raw Yak | Raw toast events | Level-ups | Promotions + traits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| classic | 78174 | 1.03 | 2.7 | 21.44 | 7.76 | 1.44 | 0.32 |
| chatgbt | 51700 | 1.18 | 2.45 | 25.47 | 13.22 | 3.37 | 0.72 |
| agents | 80062 | 1.34 | 3.01 | 29.48 | 19.15 | 3.67 | 0.59 |
| consolidation | 100816 | 1.3 | 3.19 | 32.31 | 24.3 | 4.05 | 0.73 |
| plateau | 50768 | 1.2 | 3.38 | 31.75 | 25.54 | 4.04 | 0.64 |

The census confirms that prompt opportunities outnumber popup decisions in every era, while raw Yak volume grows from 21.44 to roughly 32/min. Browser delivery is lower because the current Yak queue paces and omits ordinary backlog. The six-second minimum is not a hard ten-posts/minute cap: prompt roots and direct player responses can bypass it.

### Menus and total length

The unmodified `scripts/pace.js` was also run for sensible seed 1, both batch and eager players, through retirement at 1x and 2x. At 1x it models **237.2 minutes for batch** and **250.9 for eager**, with 164/154 decision openings and 362/679 menu sessions. Modelled menu time consumes 31%/41% of elapsed time; all pauses consume 45%/54%. At 2x the same policies take 172.7/193.6 minutes, so doubling speed does not halve a pause-heavy run.

These are sensitivity estimates. The tool does not apply the current Yak reading queue, popup-spacing implementation, prompt presentation or renderer spotlight holds, and still mirrors an older speech cap. Its “Yak lines per minute” and “popups per minute” must not be described as current browser presentation rates. It also omits prompts from its notable-interaction set. Integrator should address that in a separately scoped tool task before using it as a pacing gate.

## Growth and spotlight cost

The full census includes #549's level-ups, promotions and traits. At 1x the sampled browser shows one portrait growth toast, a promotion in Consolidation: 0.17/min there, 0.03/min overall. At 2x it shows three across the 34 minutes, 0.09/min overall. These short windows are too small to estimate rare growth notifications; the census is the stronger frequency evidence. No tier-3 growth spotlight occurs in the samples, and #549's remaining visuals must not be budgeted as already present.

The 1x windows observe **zero spotlight-only hold seconds**; the 2x ChatGBT window for seed 1 observes one printer spotlight, **21.07 seconds** beyond card/menu pauses, 5.85% of that era's six-minute exposure. This is sparse sampling, not evidence that a typical full game gains zero time from spotlights.

The standard `blender/checks/loop.mjs` check independently plays a real 1x printer spotlight: it begins after the choice, lasts **19.5 seconds**, holds week 135 throughout, ends itself and allows weeks to resume. Its synthetic hold cases also prove that time under a decision card is not double-counted against the hold cap.

For budgeting only, ten additional non-overlapping 19.5-second moments would add **3.25 minutes**; thirty would add **9.75 minutes**. These are arithmetic scenarios, not measured per-game frequencies. #552's request for typical full-run added time remains unfulfilled by the current pacing tool. Do not add a hold to every promotion: the raw promotion/trait supply is 0.32 to 0.73/min before reading pauses.

## Proposed experiments, not implementation

1. **Sim: reduce routine prompt cadence first.** Trial `B.chatPromptGapWeeks` at 5 instead of 1 while retaining one open prompt and the six approved event prompts. Five weeks at 1x is 40 active seconds, so routine templates have a long-run ceiling of **1.5/min**, compared with **3.83/min** observed in Classic Floor, a potential reduction of at least 61% in that sample's template rate. The six event prompts use their own event path, so this is not a global ceiling on all prompts. At 2x the template ceiling is still 3/min: explicitly evaluate that trade-off. Set an experimental target of 1 to 1.5 routine opportunities per elapsed minute at 1x. The lost prompt effects and replies can affect balance; require paired 200-seed-or-larger runs before adoption. No new contract fields are needed for this constant experiment.
2. **UI: protect replies without expanding Yak's workload.** Keep All / Important / Off and always-findable prompt badges. Important changes what counts as new, not which already-open channel messages are stored; do not promise that it hides the feed's routine text. Trial a presentation budget of **6 ordinary unsolicited Yak arrivals/min**, retaining immediate actionable roots and direct confirmations. The current baseline's general queue already reserves at least six seconds, so measure the actual ordinary subset before changing that value. For campaign confirmations, show one summary per management session rather than one per repeated action. Suppressing every observed Conference Booth confirmation would remove at most 79 toasts, **21.8%**, before adding summary notifications; this is an upper bound, not a predicted reduction.
3. **Reviewer: preserve focus for staged and consequential decisions.** Keep the six #575 choices in Yak and leave #17 blocked until a separate inbox has a defined role. Do not create a third concurrent stream just to relocate the same 84 routine template prompts. An experimental target is **no more than two non-urgent pausing presentations in any rolling minute**, with at least 30 seconds of actual play after the preceding pause ends; measure urgent exceptions separately. Existing spacing uses a four-game-week escape, which is about 16 active seconds at 2x, so it cannot establish a universal 30-second wall-clock guarantee. This is a proposal to review that trade-off, not a new defect claim.
4. **Integrator: treat longer weeks as an optional alternative.** Moving 8 to 10 seconds lowers purely week-driven rates by **20%** and adds 25% to active progression time. Holding the pace tool's seed-1 policy and reading/menu times fixed adds approximately **32.27 minutes** to its 968-week batch run and **28.63 minutes** to its 859-week eager run, yielding roughly **269.5/279.5 minutes** before extra spotlight holds. It does not remove simultaneous bursts and lengthens quiet stretches. Prefer the targeted prompt/notification experiment before a global clock change.

The numerical targets above are design proposals. They are not tested improvements or approved changes.

## Kairosoft comparison

Kairosoft's own [Game Dev Story description](https://store.steampowered.com/app/1847240/Game_Dev_Story/) emphasizes developing products, hiring and training staff, unlocking genres, and choosing platforms. That supports a qualitative comparison around meaningful management choices and visible staff progression. The design inference here is to preserve those choices while reducing repetitive acknowledgements around them. The source provides no interactions-per-minute benchmark, and no timed Kairosoft playtest was performed. A quantitative reference comparison is still outstanding; none of the proposed numeric targets is attributed to Kairosoft.

## Validation and acceptance status

- `npm run test:fast`: **Test Files 100 passed (100); Tests 842 passed (842)**, exit 0.
- Full census: **400 unique bot runs**, exit 0.
- Standard `node blender/checks/loop.mjs`: **6 of 6 checks passed through the game loop**, exit 0.
- Independent trace reconciliation: **34 valid browser windows, 68 virtual minutes; 2 immediate-retirement windows excluded; 0 browser errors; table counts reconcile**, exit 0.
- Measurement corrections: an initial probe omitted the launch popup's “Nice!” button and stalled; that dataset was discarded and rerun. The browser probe's initial completion guard returned exit 1 for the two zero-duration retirements; the independent audit verifies those exact exclusions. An exploratory decision-open printer check also failed because that scene begins after its choice; the standard real-printer spotlight check passed. Neither exploratory failure is presented as a game regression.

Keep #610 open. This delivers the requested bot/loop measurement and numbered proposal. The original issue also asks for live human 1x/2x playtests, timed Kairosoft reference work, separate sim/UI/reviewer consultation and a review-desk decision. The lane proposals above are one reviewer's recommendations, not approvals from those lane owners. The typical full-run spotlight-time measurement also remains open under #552. No implementation or contract change is authorized by this report.
