# Pacing on the wall clock

Issue #1639. This doc is the design for the overhaul. It measures the game in real seconds at 1x, sets an attention budget, gives a verdict for each system that asks for the player, and says how the cadence moves off game-week counters. Phase 1 changes no code.

At 1x a game week lasts 8 real seconds (`WEEK_SECONDS`), so a game year is about 7 minutes of running time, or about 10 minutes including pauses.

## 1. What the game does now

### Measured in the browser (`scripts/pace.js --browser`, seed 1, sensible bot)

| Run | Wall time | Weeks reached | Clock held | Under a decision, card or panel | Something new on screen (median gap) | Longest stretch with nothing new | Needs a response (mean gap) | Longest stretch with nothing to answer |
|---|---|---|---|---|---|---|---|---|
| Classic start, 1x | 30 min | 189 | 16% | 20% | 6 s | 46 s | 27 s | 106 s |
| Classic, 4x (the mid game) | 30 min | 504 | 44% | 45% | under 1 s | 22 s | 4.6 s (17 s for decisions and cards) | 28 s |

Interruptions per real minute. A game interruption is one the game started. A player interruption is one the bot's own action caused, which a human would also cause.

| Kind | 1x, game | 1x, player | 1x, needs a response | 4x, game | 4x, needs a response |
|---|---|---|---|---|---|
| Toast | 3.7 | 4.3 | 1.2 (toasts with an action button) | 17.5 | 7.3 |
| Mail (arrives as a "Mail from" toast) | 0.5 | 0 | see the sim counts below | 2.6 | see below |
| Yak post | 2.6 | 2.2 | 0 | 4.3 | 1.3 |
| Yak prompt | 0 | 0 | 0 | 1.3 | 1.3 |
| Decision modal | 0.63 | 0 | 0.63 | 2.6 | 2.6 |
| Card (launch result, unlock, New) | 0.67 | 0.03 | 0.70 | 0.93 | 0.93 |
| Panel (lockdown) | 0.07 | 0 | 0.07 | 0.03 | 0.03 |
| Advisor peek, office "Needs you", tutorial | 0 | 0 | 0 | 0.03 | 0.03 |

At 4x a decision opens every 23 seconds and the game spends 45% of the wall clock under a modal. Every gate counts in game weeks, so 4x quadruples the asking instead of letting the player watch the company grow faster.

The browser player answers most Yak prompts and mail inside its weekly management turn, two seconds after each week starts, so at 1x they rarely reach the screen as presentations. It never opens the inbox, the advisor or the Yak channels on its own either. So the browser rates are a floor for what a human sees. The sim emits more than this, as the next table shows.

### What the sim asks for (sensible bot, 5 seeds, per real minute of unpaused 1x play)

These counts come from a one-off probe that tallied the sim's events through `runBot`. pace.js can't start in another era or from a save, so this probe is the only measure here for the dot-com start and for late Classic.

| Stretch | Decision | Yak prompt | Mail with a choice | Mail, flavour | Toast | Launch | Unlock | Yak lines | Speech bubbles |
|---|---|---|---|---|---|---|---|---|---|
| Classic, weeks 0 to 200 | 1.1 | 1.3 | 0.8 | 1.4 | 3.5 | 0.6 | 0.3 | 18 | 25 |
| Classic, weeks 200 to 600 | 1.4 | 1.3 | 1.0 | 2.5 | 9.2 | 2.1 | 0.0 | 26 | 48 |
| Classic, weeks 600 to 1040 | 1.2 | 1.4 | 1.1 | 2.6 | 15.0 | 3.5 | 0.0 | 27 | 66 |
| Dot-com start, weeks 0 to 200 | 1.2 | 1.0 | 0.6 | 1.9 | 2.9 | 0.5 | 0.2 | 16 | 20 |

Summed, the sim asks the player to answer something (a decision, a prompt or a mail) about **3.4 times a minute**, once every 18 seconds of running play, from the first year to the last and in every era. On top of that come 1.4 to 2.6 flavour mails, 3 to 15 toasts and 16 to 27 Yak lines a minute. Yak is metered by `yakMinGapSeconds` 6, so most of those lines are dropped. That is why it feels like nothing ever stops talking: something new reaches the screen every 6 seconds, and the longest quiet stretch in 30 minutes was 46 seconds.

### The bot's timing versus a human's

The browser player is faster than a person. It gives every decision a flat 8 s and every other card 6 s, whatever the length of the text. It answers Yak prompts and mail inside its weekly turn, never opens the inbox and spends no time in menus. So the measured numbers above are a **floor**.

The estimate below re-times the same two traces as a human would play them. It reads the actual text of every decision, card and panel at 200 words a minute, plus 4 s to choose on anything with a choice. Mail and Yak prompts are added at the sim's rates: each mail is about 30 words plus 2 s to open the inbox, and each prompt about 45 words at 1x and 27 at 4x, its observed length. Hiring, building and other management add 10 s of menu time per minute of running play. The game weeks played and the running time are unchanged. Only the paused time is re-timed.

| Measure | 1x, bot | 1x, estimated human | 4x, bot | 4x, estimated human |
|---|---|---|---|---|
| Wall time to play the same weeks | 30 min (189 weeks) | **55 min** | 30 min (504 weeks) | **107 min** |
| Share of wall time paused | 16% | **54%** | 44% | **84%** |
| Mean time on a decision, card or panel | 8.5 s | 21 s | 7.7 s | 23 s |
| Mail read in a paused inbox | 0 | 54 mails, 11 min | 0 | 227 mails, 48 min |
| Running play between things needing an answer (mean) | 27 s | **21 s** (decisions, prompts and mail with a choice) | 17 s | **4 s** |
| Reading time of game toasts and Yak posts, as a share of watching time | not read | **43%** | not read | **239%** (unreadable) |
| Longest watching stretch with no game ask | 98 s (decisions, cards and mail toasts only) | under 98 s once prompts and mail land in it | 27 s | 27 s or less |

The estimate barely moves with its assumptions. Menus at 5 to 15 s a minute and reading at 200 to 250 words a minute give 52 to 55 minutes and 52% to 54% paused at 1x.

What a human gets at 1x is that **more than half the session is paused** reading things. Between pauses, something new wants an answer every 21 seconds of play. If they read every toast and Yak post, that takes another 43% of the time the game is running. At 4x, one minute in six is spent watching the company. The speed button makes the game slower to play, not faster.

### Mail, in real minutes

sim's mail probe (draft #1641, 1200 games) measures mail per game month. A game month is 4.33 weeks, or 35 s of running play at 1x.

| | Mail per real minute at 1x | Flavour per real minute | Worst burst | Reading cost per minute of play |
|---|---|---|---|---|
| main | 3.3 (one every 18 s) | 2.0 | 9 mails in 32 s; 1161 of 1200 games see 4 or more in 32 s | about 40 s |
| Draft #1641 | 1.35 (one every 44 s) | 0.4 | 4 in 32 s | about 16 s |
| This proposal | 0.12 to 0.2 (one every 5 to 8 min) | 0 | 1 | about 2 s |

Draft #1641 is a big step in the right direction. It still sends seven to eleven times the mail this budget allows.

### Why it piles up

- **Three independent queues.** Decisions keep `decisionGapWeeks` 3 (24 s) from the last pause. Yak prompts keep their own slot (`chatPromptsOpen` 1, `chatPromptGapWeeks` 1, so 8 s). Mail keeps another (`mail.actionOpen` 2). None of them knows about the others, so up to four answerable things can be open at once, and a prompt can open 8 seconds after a decision closes.
- **Everything counts in game weeks.** Every gate is in weeks except Yak delivery and the 30 s card spacing (`ui/spacing.js`). At 4x the same game produces four times as many asks per real minute, and the advisor, mail and prompt rates don't slow down at all.
- **Rates grow with the company.** Toasts go from 3.5 to 15 a minute and launches from 0.6 to 3.5 a minute (each one a result card). The asking rate never falls, so the late game is the busiest stretch, where Kairosoft games are the calmest.
- **The same news arrives twice.** In the 1x run every launch showed as a toast ("Notemind launched! Reviews average 8.4.") and then as a result card with the same news.

### Every system that asks for attention

| System | Trigger and current rate | Holds the clock | Needs an answer | Clock |
|---|---|---|---|---|
| Decision modal | `randomEventChance` 0.22 a week (one every 36 s), `decisionGapWeeks` 3 (24 s), `eventGraceWeeks` 10, per-event `cooldownWeeks`, up to 2 held rolls | yes | yes | weeks |
| Floor-window decisions | a fixed week each after the Office Floor | yes | yes | weeks |
| Incident decisions | severity rolls; skip the gap | yes | yes | weeks |
| Mail | from week 4: `ambientChance` 0.35 and `actionChance` 0.12 a week, 2 open, `expiryWeeks` 8, reply-all storms; letter-like events become mail | no (opening the inbox does) | actionable ones | weeks |
| Yak posts | chatter rolls and situations; delivery at least 6 s apart | no | no | rolls in weeks, delivery in seconds |
| Yak prompts | `chatPromptChance` 0.6 a week from week 6, 1 open, 1-week gap, expire after 3 weeks; `yak` events land here | no | yes | weeks |
| Advisor peek | `pushGapWeeks` 12, per-topic 26, a 9 s peek card; none at 4x | no | no | weeks |
| Toasts | `WEEK_BUDGET` 3 a week (one every 2.7 s), the extras collapse into "+N more"; live 6.5 to 9 s | no | some | weeks and ms |
| Launch result card | each launch; 30 s of play or 4 weeks after the last card | yes | dismiss | seconds or weeks |
| Unlock and New cards | `unlockGapWeeks` 6 plus the 30 s spacing | yes | dismiss | weeks |
| Staged moments (spotlights) | printer jam 22 s, music night 90 s, waffle party 16 s, user test 12 s and others | yes, up to 180 s | no (Skip) | seconds |
| Office promotion "Needs you" | 2 stable weeks | no | soft | weeks |
| Remote-call grid | `callWeekChance` 0.2 during lockdown | no | no | weeks |
| Standups | weekly; spoken lines | no | no | weeks |
| Incentives | every 8 weeks; music night asks a genre decision first | music night | music night | weeks |
| Era arrival | once an era | yes | dismiss | weeks |
| Goals | on completion; toast | no | no | weeks |
| AI interviews | staged hire 15% | yes | yes | weeks |
| Tutorial | first steps | yes | yes | n/a |

## 2. What the reference games do

These figures come from playing the games, not from measuring them, so they are approximate.

- **Game Dev Story, Mega Mall Story (Kairosoft).** At normal speed a game year lasts a few real minutes. Almost everything you see is ambient: points pop over desks as numbers, "Bug!" bubbles, staff walking about, a counter ticking up. You watch it and never answer it. The modal moments are the player's own loop (start a project, name it, pick a genre) and a few fixed beats: a release review sequence, the yearly awards and trade show, an occasional visitor or "had an idea!" pop. Something you must answer that you didn't start comes every few minutes at most. Whole stretches of a minute or two are just watching the bars fill, and that watching is the game.
- **RollerCoaster Tycoon.** Nearly nothing is modal. News goes to a ticker at the bottom that you can ignore: guest complaints, a ride that broke down, an award. Guest thoughts are pure ambient data you go looking for. The game stops only when you open a window. The pressure comes from systems drifting (queues, breakdowns, litter), which you notice by watching, not from prompts.

What they share is that the player starts almost every interaction. The game's own interruptions are rare, and they are worth reading when they come: the review score, the award, the breakdown. Nearly everything is shown ambiently, over the world, and nothing waits on an answer.

## 3. The attention budget (real seconds at 1x)

Three tiers. Every message the game produces belongs to exactly one of them.

| Tier | What it is | Pauses | Needs an answer | Budget |
|---|---|---|---|---|
| **Ask** | a decision, an answerable prompt or a letter with choices | the decision modal does; a prompt doesn't | yes | **one open at a time across every system**; at least **90 s of running play** between asks (target average **2 to 3 min**) |
| **Beat** | launch result, era arrival, staged moment, award, incident card | yes, briefly | dismiss only | at least **45 s of running play** after any Ask or Beat closes; staged moments **at most one per 5 min**, held **at most 25 s** |
| **Ambient** | numbers and bubbles over desks, Yak flavour, standups, the call grid, status toasts | never | never | Yak flavour **at least 20 s apart** while the dock is open; status toasts **at least 15 s apart**, merged when they share a subject; everything else is drawn in the world |

Rules:

- **One Ask at a time.** A single attention queue holds every candidate Ask (decision, prompt, letter), ordered by priority. Only the head of the queue is shown. The others wait.
- **Waiting costs something.** A low-stakes Ask that waits more than **3 min** expires to its default outcome, shown as one ambient Yak line ("Lena picked the cat for you."). Emergencies (incidents, cash crisis, a legal letter) never expire. They jump the queue but still wait out the 45 s quiet after a Beat.
- **Quiet after a modal.** No Ask or Beat for **45 s of running play** after any modal closes, so the player gets to watch what they just chose play out.
- **A guaranteed watching stretch.** In any 10 minutes of play there is at least one **3 min** stretch with no Ask and no Beat that the game started.
- **Player-caused feedback is exempt** (the toast for your own hire, the card for your own launch). It still collapses: a launch is **one** card, not a toast followed by a card with the same news.

What that comes to at 1x over 20 minutes: about **8 Asks** (down from about 55 that the sim opens now), about **6 Beats**, and at least **two 3-minute watching stretches**.

## 4. Verdict per system

| System | Verdict | What changes |
|---|---|---|
| Decision modal | **Keep, slow** | Through the attention queue. Cut the roll rate so the pool doesn't back up: about one candidate every 2 min of running play. Weak, repetitive events (the ping-pong, printer and pet family) become ambient incidents or Yak lines with no choice. |
| Incident decisions | **Keep** | Emergency priority in the queue. Only severity 3 and up asks; below that the team handles it ambiently (a red bubble and a Yak #incidents post). |
| Floor-window decisions | **Keep** | Through the queue, low priority, can expire. |
| Yak prompts | **Merge** into the queue | A prompt is an Ask like any other. It stops having its own slot and weekly 60% roll. Most `yak` events are low-stakes, so they are the ones that expire to a default. |
| Mail | **Cut the inbox as a stream** (see below) | |
| Yak flavour posts | **Make ambient, slow** | At least 20 s apart, no unread badge for flavour, and important posts only (#incidents, #wins) light the dock. |
| Toasts | **Slow, make most ambient** | Status news (three-quarters done, back from vacation, trend) moves into the world as a desk bubble or floating text over the subject. Toasts stay only for money, staff changes and goals: at least 15 s apart, merged by subject. |
| Advisor peek | **Make ambient** | Drop the peek card. The advisor button glows when advice matters; the player opens it. |
| Launch result card | **Keep** | It is the Game Dev Story review beat, and the player caused it. In the mid and late game, each launch after the first few of a year goes into a single "this quarter's launches" card when two land within 60 s. |
| Unlock and New cards | **Merge, make ambient** | Unlocks become a "New" pip on the build or policy menu plus one toast. A card only for a whole new system (the first Research, Ops, Standups) or an era. |
| Staged moments | **Keep, cap** | At most one per 5 min and 25 s of held clock. Music night's 90 s stops holding the clock: it plays while the game runs. |
| Office promotion | **Keep** | It is already non-modal. |
| Remote-call grid, standups | **Keep ambient** | No change. |
| Incentives | **Make ambient** | Music night picks its genre (the bot's choice, shown in Yak) and asks nothing. |
| Era arrival | **Keep** | Rare, and it is the biggest beat in the game. |
| Goals | **Keep** | Player-caused feedback. |
| AI interviews | **Keep** | Player-caused (you are hiring). |

### Mail versus Yak: cut the inbox as a stream, keep letters for the outside world

Mail and Yak do the same job now: text from a person, sometimes with choices, that arrives on its own. Mail adds 1.4 to 2.6 flavour messages a minute that nobody needs to read, and 0.6 to 1.1 more answerable items a minute on a queue separate from decisions and prompts. Two inboxes for one kind of content doubles the reading, and the redundant one is the reason the owner feels the game never stops talking.

My recommendation:

1. **Cut flavour mail** (`ambientChance`) entirely. The jokes that land become Yak lines or, for spam, a single ambient gag (an occasional floating "unread: 1,204" over the founder's desk).
2. **Mail keeps one job: letters from outside the company that carry a real choice**, such as an acquisition offer, an investor term sheet, a recruiter poaching someone, a legal threat or a rival's partnership pitch. These are the things Yak can't plausibly carry, since Yak is the team talking. Each one is an Ask in the shared queue and arrives as a letter card (a distinct look, and the envelope sound). Expect about one every 5 to 8 minutes.
3. **The envelope stays as an archive** of letters received and answered, never as a to-do list. It shows no unread count for anything you've already been shown.
4. **Reply-all storms** become an ambient gag (Yak plus bubbles over desks), not mail.

Merging mail wholly into Yak loses the outside-world voice, which is the one thing mail does that Yak can't. Keeping the inbox as it is keeps the redundancy. A small number of letters is the distinct part worth saving.

## 5. Moving cadence to the wall clock

The sim is deterministic and counts weeks, and it must stay that way (no `Date.now` in `src/sim/`). So the wall-clock cadence lives in the presentation layer, and the sim only proposes.

**The sim proposes, the clock disposes.**

- `src/sim/` stops opening asks on its own. Each weekly roll that today calls `raiseDecision`, `openEventPrompt` or `actionable()` mail appends a candidate to `state.asks` (id, kind, priority, created week, expiry rule, default choice). That is deterministic, as today.
- A new pure module in `src/pacing.js` (`createAttention`) runs on real seconds: running seconds since the last Ask, the quiet after the last modal, the 5 min staged-moment window and the 3 min expiry. When the budget allows, `main.js` dispatches `{ type: 'presentAsk', id }`. The sim then turns the head candidate into `pendingDecision`, a prompt or a letter. When a candidate times out, the clock dispatches `{ type: 'expireAsk', id }` and the sim applies its default.
- Because both are dispatched actions, a save or a replay stays deterministic: the action log records the week each ask was presented.
- `ui/spacing.js` (the 30 s card gap) folds into the same module, so cards and asks share one budget.
- The bots (`runBot`, balance) present each candidate when the queue gives it to them, which keeps balance runs independent of the wall clock. One balance setting decides how many weeks a candidate waits in a bot run, so bot outcomes match the 1x experience.

**Speed scaling.**

| Scales with speed (game time) | Fixed in real seconds |
|---|---|
| the economy, project progress, staff XP, decay | the gap between Asks (90 s), the quiet after a modal (45 s), the 3 min expiry |
| how many candidates the sim proposes per game year | reading time for bubbles, toasts, cards and Yak lines |
| when a candidate stops fitting (`fits`, week-based expiry) | the staged-moment window (5 min) and cap (25 s) |
| | the Yak flavour gap (20 s) and the toast gap (15 s) |

So at 4x the player sees the same Asks per real minute as at 1x, and **fewer Asks per game year**: the extra candidates expire to their defaults. That is the point of 4x. It is "let me watch it build", not "give me four times the paperwork". At 4x, staged moments are skipped (they are already counted as skipped at 4x).

**Rate retune.** The candidate rate should roughly match the budget at 1x, so few expire at 1x: about 0.5 to 0.7 candidates per running minute in all, against 3.4 now. That is a cut of about 5x, mostly from prompts and mail.

## 6. Decisions for the owner

1. **Mail.** Cut flavour mail and keep letters only for outside offers with a real choice, at about one every 5 to 8 min. *Recommend: yes.* The other options are merging it all into Yak, or keeping mail as it is but rarer.
2. **The Ask gap.** At least 90 s, average 2 to 3 min at 1x. *Recommend: 90 s minimum, 150 s average.* Shorter (60 s) keeps more drama; longer (4 min) is closer to Game Dev Story.
3. **4x behaviour.** Asks stay at the 1x real-time rate and the excess expire to their defaults. *Recommend: yes.* The alternative is that 4x keeps every Ask and simply fills the screen faster.
4. **Expired asks.** A low-stakes Ask the player hasn't reached in 3 min resolves to a sensible default, shown as a Yak line. *Recommend: yes.* The alternative is that they wait forever, which brings the pile back.
5. **Weak events.** Demote the repetitive office gags (ping-pong, printer, pet) from decisions to ambient moments with no choice. *Recommend: yes.* It is a content cut the owner may want to pick through.
6. **Staged moments.** At most one per 5 min, holding the clock at most 25 s, and music night stops holding it. *Recommend: yes.*

## 7. How to measure success

Rerun the same commands after each implementation step and compare.

```bash
timeout 2100s nice -n 10 node scripts/pace.js --browser --seed 1 --speed 1 --bot sensible --minutes 30 --out shots/pace-1x
timeout 2100s nice -n 10 node scripts/pace.js --browser --seed 1 --speed 4 --bot sensible --minutes 30 --out shots/pace-4x
```

| Measure (game-started only) | Now, 1x | Now, 4x | Target, 1x and 4x |
|---|---|---|---|
| Asks (decision, prompt, letter) per real min | 3.4 opened by the sim; 0.63 decisions seen | 3.9 seen (decisions and prompts) | 0.35 to 0.5 |
| Shortest gap between Asks (running play) | 24 s (decisions alone) | under 1 s (median 14 s) | at least 90 s |
| Beats (cards, moments) per real min | 0.7 | 0.93 | at most 0.3 |
| Share of wall time under a modal | 20% | 45% | at most 8% |
| Share of wall time paused, estimated human | 54% | 84% | at most 25%, menus the player opens included |
| Running play between things needing an answer, estimated human | 21 s | 4 s | at least 90 s, mean 150 s |
| Toasts per real min | 3.7 | 17.5 | at most 2 |
| Yak posts per real min | 2.6 | 4.3 | at most 2 flavour posts, every important one shown |
| Longest stretch with nothing game-started asking or holding | 106 s | 28 s | at least 180 s in every 10 min |
| Asks open at once | up to 4 | up to 4 | 1 |

Judge the targets at human timing. Bot timing makes every paused share look about three times better than a person will find it. Until pace.js can read at human speed, the human columns come from re-timing its trace as in section 1.

What pace.js needs before it can measure this directly:

1. **A reading policy (a small flag).** Replace the flat 8 s and 6 s dwell in the browser player's `act` (`scripts/pace-browser.js`) with `--wpm N --choose S`. That makes the dwell `words(text) / N * 60 + (actionable ? S : 0)`. Every record already carries its text, so this is a few lines.
2. **Visible prompts and mail.** A mode where the player leaves Yak prompts on screen and answers them after their reading dwell, through the UI rather than in its weekly turn. It would also open the inbox when mail arrives and dwell there by the same rule.
3. **A menu dwell.** For example `--menu-seconds 10` per running minute: the player opens its management panel for that long instead of acting at no cost.
4. **Era and save starts** (`--era dotcom`, `--load <save>`). The dot-com and late-game numbers above come from a one-off sim probe instead.
