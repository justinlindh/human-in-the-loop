# Sim Contract

The interface between the simulation and everything that reads it. Only the lead edits this file; propose changes by message.

### Sim API

```js
// src/sim/index.js public surface
createGame({ seed, companyName }) -> State
tick(state) -> SimEvent[]              // advances one week, mutates state; returns [] if gameOver or pendingDecision
dispatch(state, action) -> { ok, reason?, events: SimEvent[], ...extra }   // immediate, works while paused
                                   // extra: startProject returns projectId; buyItem returns id
dateOf(week) -> { year, yearIndex, week, quarter }
productAppeal(state, product) -> number
oversightRequired(state) -> hours; oversightProvided(state) -> hours
securityPosture(state) -> 0..100
scoreRun(state) -> { score, valuation, breakdown }
loadGame(storage) -> { ok, state?, reason?, notice? }   // notice: a message to toast after a successful load (src/save/save.js)
// A save the current build can't run returns { ok:false, stale:true, version, reason:'Save is from an older build'|'Save is from a newer build' }; ui offers Start fresh instead of failing.
exportSave(storage, id) -> string   // the raw save text, for keeping a stale save; saveMeta carries `version`
FUNCTIONS = ['engineering','support','sales','marketing','qa','ops']
SAVE_VERSION = 1
```

### State shape (JSON-serializable; all numbers finite)

```js
State = {
  version, seed, rng: { s }, companyName, week, nextId,
  cash, brand /*0..100*/, institutionalKnowledge /*0..100*/, comprehensionDebt /*0..100*/,
  officeStage /*0|1|2*/,
  staff: Staff[], candidates: Staff[], candidatesWeek,
  projects: Project[], products: Product[],
  automation: { [fn]: { level /*0..1*/, model /*model id*/ } },
  policies: { [policyId]: true },
  campaigns: [{ id, channel, productId, projectId, weeksLeft }],
  security: { auditBoost /*0..100 decaying*/, tooling /*bool*/ },
  ops: { supportShortfall /*0..1*/, maintenanceShortfall /*0..1*/, maintenanceCapacity, oversightRequired, oversightProvided },
  market: {
    categories: { [catId]: { incumbentStrength, clones } },
    trend /*trend id*/, trendWeeksLeft, unlockedCategories: [ids], unlockedAngles: [ids],
  },
  models: { [modelId]: { version, capability, costMult, available, deprecated } },
  items: [{ id, itemId, level /*1..3*/ }],     // office shop items; array index is the slot; max slots per stage in OFFICE_STAGES[stage].itemSlots
  research: { done: [researchIds] },
  modifiers: [{ id, key, value, label, untilWeek, source }],   // temporary effects from decisions; key names a sim bonus (e.g. 'output', 'meaningRecovery')
  scheduled: [{ id, week, kind /*'effects'|'event'*/, payload }],   // delayed consequences and follow-up events; UI does not reveal payloads
  discoveredCombos: { ['cat:angle']: fitNumber },
  outage: null | { productId, kind, severity, weeks, unrecoverable },
  incidentLog: [{ week, kind, productId, caught, severity }],   // last 30
  chatLog: [ChatEvent],   // the most recent chat events (same shape as the chat SimEvent), last 80, so the feed survives save and load
  lowCashWeeks,
  pendingDecision: null | { eventId, title, text, subjectId, choices: [{ label, hint, available, reason }], vars },   // available false: requirement unmet, reason says why   // vars: placeholder values fixed when raised; UI may ignore
  flags: {},
  stats: { hires, juniorsHired, resignations, incidents, caught, breaches, launches, awards, peakMrr },
  history: [{ week, cash, mrr, customers, brand, debt, ik, juniors, mids, seniors, avgMeaning, incidents }],
  gameOver: null | { won, reason /*'ipo'|'acquired'|'leader'|'runway'|'collapse'|'timeout'*/, score, epilogue: [strings] },
}

Staff = {
  id, name, role /*engineer|designer|marketer|support|security|sales*/,
  seniority /*junior|mid|senior*/, level /*1..20*/, xp,
  skills: { features, polish, reliability, novelty } /*1..100*/, speed /*0.8..1.2*/,
  meaning /*0..100*/, stamina /*0..100*/, knowledge /*0..100*/, traits: [traitIds],
  assignment: { type, targetId /*or null*/ },
  // type: project|maintenance|oversight|mentor|hardProblem|support|sales|security|marketing|idle|sabbatical
  mood /*ok|coasting|burnout|away*/, burnoutWeeks, sabbaticalWeeksLeft,
  salary, hiredWeek, founder /*bool*/,
  path /*career path id or null*/, pathPending /*bool: promoted to senior, path not chosen yet*/, legend /*bool*/,
  record: { mentorWeeks, catches, hardProblemWeeks },   // counters for earned traits
  appearance: { skin /*0..5*/, hair /*0..7*/, hairColor /*hex*/, shirt /*hex*/, pants /*hex*/, accessory /*none|glasses|headphones|beanie|cap*/, build /*0..2*/ },
  voice: { set /*'fem'|'masc'*/, variant /*0..n-1 within the set*/, pitch /*-1..1 per-person offset*/ },   // chosen with the first name so name and voice agree; staff text refers to people by name or they/them
}

Project = {
  id, kind /*new|update|migration|refactor|craft|research*/, name, category, angle, model, size /*small|medium|large*/, researchId /*research kind only, else null*/,
  pointsNeeded, progress, stats: { features, polish, reliability, novelty }, productId /*or null*/, startedWeek, bankedHype,
}

Product = {
  id, name, category, angle, model, modelVersion, version /*1,2,...*/, size,
  stats: { features, polish, reliability, novelty }, score /*0..10*/,
  reviews: [{ outlet, score, quote }],
  customers, mrr, hype /*0..100*/, novelty /*0..10*/, health /*0..100*/, baseHealth, uptime /*0..1*/,
  launchedWeek, copyAtWeek, copied, wrapperHit, ownerId /*or null*/, migrationDueWeek /*or null*/, killed,
}
```

### SimEvent shapes

```js
{ type: 'bubble', staffId, text, tone }   // tone: features|polish|reliability|novelty|good|bad
{ type: 'toast', text, tone, trendId }    // tone: info|good|warn|bad; trendId: set when the toast announces a market trend, else absent
{ type: 'chat', id, week, channel, from, fromId, text, replyTo, reactions }
                                          // channel: general|incidents|wins|random|standup; from: staff name or a bot handle like '@pagerbot'
                                          // fromId: staff id or null for bots; replyTo: chat id or null; reactions: { [emoji]: count }
{ type: 'launch', productId }
{ type: 'incident', kind, productId, caught, severity }
{ type: 'resign', staffId, name, fired, reason }    // fired: true when the player fired them; reason: 'fired'|'burnout'|'moved_on'|'poached'|'retired' (older saves may omit it; treat missing as 'burnout' when fired is false)
{ type: 'hire', staffId }
{ type: 'decision' }
{ type: 'decisionResolved', eventId, choice, subjectId }   // emitted by resolveDecision: the event id, the chosen choice index, and the subject (or null). Render and ui react to the choice; never infer it from effects
{ type: 'officeUpgrade', stage }
{ type: 'celebrate', staffId }            // staffId may be null for company-wide
{ type: 'award', text }
{ type: 'gameOver' }
{ type: 'standup', mode, lines: [{ staffId, text }] }   // mode: 'daily' (in person) | 'async' (lines also emitted as #standup chat)
```

### Actions (`dispatch` payloads)

```js
{ type: 'hire', candidateId }
{ type: 'fire', staffId }
{ type: 'assign', staffId, assignment: { type, targetId } }
{ type: 'train', staffId, program /*workshop|conference|course*/, focus /*skill name, workshop only*/ }
{ type: 'choosePath', staffId, pathId }
{ type: 'buyItem', itemId }
{ type: 'upgradeItem', id }
{ type: 'sellItem', id }
{ type: 'startProject', kind: 'new', name, category, angle, model, size }   // name: trimmed, 1 to 20 characters
{ type: 'startProject', kind: 'update'|'migration', productId }
{ type: 'startProject', kind: 'refactor'|'craft' }
{ type: 'startProject', kind: 'research', researchId }
{ type: 'setAutomation', fn, level, model }
{ type: 'setPolicy', id, on }
{ type: 'runCampaign', channel, productId, projectId }   // exactly one of productId / projectId
{ type: 'setOwner', productId, staffId }
{ type: 'killProduct', productId }
{ type: 'upgradeOffice' }
{ type: 'buyAudit' }
{ type: 'setTooling', on }
{ type: 'callConsultants' }
{ type: 'resolveDecision', choice }
{ type: 'ipo' }
```


---

## v2 changes (Structure v2: eras, unlocks, founding, placement)

These supersede the matching parts above. Where v2 and v1 disagree, v2 wins.

### createGame
```js
createGame({ seed, companyName, logoColor, tagline, founders /* [archetypeId, archetypeId] */, funding /* 'bootstrapped'|'family'|'preseed' */ })
// every option is optional; defaults: founders ['engineer', 'designer'], funding 'bootstrapped'
```
The run starts at week 0 = January 2019 (dateOf(0).year === 2019).

### State additions and changes
```js
era: { id /* 'classic'|'chatgbt'|'agents'|'consolidation'|'plateau' */, since /* week */ },
eraSchedule: { chatgbt, agents, consolidation, plateau },          // arrival weeks for this run (jittered)
unlocks: { [key]: week },                                  // keys: 'marketing','ops','research','models','automation','paths','standups', 'policy.<id>'
goals: { [goalId]: { done /*bool*/, week /* or null */ } },
// Count goals in src/data/goals.js also define progress(state, h) -> { n, of }, with n capped at of and never rounded up
// to of before done. h = goalHelpers(state), exported from src/sim/index.js. ui reads these for progress bars and never recomputes them.
founding: { founders: [archetypeIds], funding, logoColor, tagline },
office: {
  stage /* 0|1|2, mirrors officeStage */,
  placed: [{ id, itemId, level /*1..3*/, x, y, rot /*0..3*/ }],   // tile coordinates on the stage grid
},
// REMOVED: items[] (the fixed-slot shop list); shop items are now entries in office.placed.
// gameOver.reason gains 'retired' (won: true, with retiredVia: 'ipo'|'acquired') and 'anniversary' (won: true; set at the end of week 1039, so state.week reads 1040); 'timeout' is gone.
```
Seats: each Staff has `deskId` (the id of a placed desk, or null while they have no desk). A person keeps their desk until that desk is sold or they leave; only then is a free desk assigned (the lowest free desk in placed order). Moving a desk keeps its sitter. The renderer and adjacency `paid` read `deskId`; nobody else changes seat when one person leaves.

Grid: OFFICE_STAGES[stage].grid = { w, h }, .door = { x, y }, .blocked = [[x, y], ...]. Tile (0, 0) is the back corner where the two visible walls meet; x runs along the right-hand back wall, y along the left-hand back wall. Item footprints come from ITEMS[itemId].footprint = { w, h } before rotation (rot 1 and 3 swap w and h).

### Actions
```js
{ type: 'placeItem', itemId, x, y, rot }      // buys and places; returns { ok, id }; reasons include 'Blocked', 'Out of bounds', 'Would block the path to a desk', 'Not enough cash'
{ type: 'moveItem', id, x, y, rot }           // free
{ type: 'upgradeItem', id }
{ type: 'sellItem', id }                      // half refund of total spent
{ type: 'retire' }                            // valid when an IPO is available or an acquisition offer is open
{ type: 'keepPlaying' }                       // valid only after the anniversary ending; clears gameOver, keeps flags.anniversaryScore, play continues
// REMOVED: buyItem (placement replaces it)
// hire gains the reason 'No free desk'
```

### Events
```js
{ type: 'era', eraId }          // an era arrived (UI shows the era card)
{ type: 'unlock', key }         // a system unlocked (UI slides in the menu button and explainer card)
{ type: 'goal', goalId }        // a goal completed
```

## Speech vs Yak

Speech bubbles in the office and Yak messages are separate streams.

```js
{ type: 'say', id, week, staffId, text, toId, replyTo, tone, moment }   // spoken aloud in the office; tone: optional 'happy'|'annoyed'|'tired'|'questioning'|'excited'|'laughing'|'sighing' for voice barks (null lets audio infer it); toId: the person addressed (or null); replyTo: the say id this answers (or null)
                                          // moment: optional event id; marks the line as that staged moment's own (#627), so the renderer shows it during the moment's spotlight while unmarked lines near it are held
```
- The renderer shows speech bubbles for `say` events only. A `chat` event is Yak only; the renderer may show a small typing emote on the author's character, never a bubble.
- `say` events are never added to `chatLog` and never appear in Yak.
- Spoken exchanges are between people in the office (not away); `toId` lets the renderer turn speakers toward each other.

## Content ladder state (Phase 6)

```js
lockdown: null | { since /* week */, until /* week */, stayerId /* staff id of the one person who never left, or null */ },
workPolicy: null | 'office' | 'hybrid' | 'remote',     // chosen when the lockdown ends; null before
pets: [{ id, species /* 'dog'|'cat' */, name, ownerId /* staff id, or null once the owner leaves */, arrivedWeek }],
rival: null | { name, founderName, logoColor, categoryId, strength /* 0..100 */, status /* 'rising'|'stalled'|'acquired'|'dead'|'merged' */ },
// Staff gains:
remote /* bool: working from home this week; the renderer hides them like 'away', ui marks them remote */,
strain /*0..100: sustained exhaustion from load; high strain leads to burnout even when meaning is fine*/,
call /* null, or during a video-call week { muted, frozen, badCamera } (booleans, rerolled weekly) for ui's call grid */,
```
- During a lockdown every staff member except `stayerId` has `remote: true`. The office stays placed but empty; ui may show a video-call grid of the remote staff using portraits.
- Under `workPolicy: 'hybrid'` the sim sets `remote` per person per week; under `'remote'` most staff are remote most weeks; under `'office'` nobody is.
- Pets are rendered in the office whenever their owner is present (or always, once `ownerId` is null and the pet has stayed as the office pet).

### Content ladder events
```js
{ type: 'incentive', staffId, reward /* 'finger_traps'|'balloons'|'caricature'|'melon_bar'|'music_night'|'waffle_party' */ }   // the Incentives Program rewards a top performer; the renderer stages it
{ type: 'incentive', staffId, reward: 'music_night', genre /* 'corporate_synthwave'|'motivational_polka'|'aggressive_bossa_nova'|'sad_lofi' */, dancers /* staff ids joining in */ }   // a staged dance break: the winner picks a genre through a decision, the room dims, the dancers dance to that genre's track, then everyone goes back to work
```

### Content ladder chunk (b): Meaning, Purpose, strain, incentives
```js
unlocks: 'meaning'                 // opens with the ChatGBT era; before it, ui shows mood and energy, not Meaning
purpose: null | { value /*0..100*/, mission /* mission id */, tests: [{ week, text, delta }] }   // set by the mission decision in Agents; moved by later test decisions
{ type: 'timeOff', staffId }       // 2 weeks away, strain recovers fast; reasons: 'No such staff member', 'They are away'
policies: 'no_crunch', 'incentives', 'crunch' // with unlock keys 'policy.no_crunch', 'policy.incentives', 'policy.crunch'; 'crunch' (Crunch Mode) opens at the first launch and excludes 'no_crunch': turning either on turns the other off
chat reaction key: 'no_at_channel'  // the @channel faux-pas reaction
```
- Rewards beyond balloons, caricature and waffle_party are toasts in ui; the renderer stages the three it has props for and treats the others as a small celebrate beat.

### Cancelling a project
```js
{ type: 'cancelProject', projectId }   // reasons: 'No such project'
```
- Removes an unfinished project of any kind. Its progress is lost and nothing is refunded; anyone assigned to it goes idle, and campaigns aimed at it end.
- Returns `{ ok: true }`, plus a chat line in the owner's voice (or the founder's) so the cancellation is visible in Yak.

### Late-game money sinks
```js
{ type: 'acquire', targetId }   // buy a company from state.market.forSale; reasons: 'No such company', 'Not enough cash'
state.market.forSale: [{ id, name, categoryId, arr, price, staff /* 1..3 */, expiresWeek }]
state.fame /* 0..100: softens churn and hiring costs; raised by fame campaigns, decays slowly */
state.office.expansion /* 0..3 HQ expansion steps; the renderer extends the HQ shell per step */
```
- An acquisition adds the company's product (with its customers) and staff to the player's company, and emits `chat` lines announcing it.
- HQ expansion steps each raise the staff cap; the renderer keeps the whole office within the Low quality budget at the maximum cap.
- `upgradeOffice` at the HQ buys the next expansion step: `office.expansion` +1 and an `officeUpgrade` event with `{ stage: 2, expansion }`. Gate reasons come from `officeGateReason`; past step 3 the reason is 'Already at the biggest office'.
- Desks at the HQ are capped at 30 + 5 per expansion step (45 at most). `buyItem` and placement refuse more with 'Desk limit reached'.
- `acquire` also needs a free desk for each incoming person; otherwise it refuses with 'No desks for their team'. Every staff member always has a desk.
- policies: 'top_pay' (Top-of-Market Pay) and 'office_upkeep' (Office Upkeep), unlocking at the HQ, with a weekly cost that scales with the company. ui reads the current cost from `policyCost(state, id)`.

### The Waffle Party is earned by a personal milestone
```js
{ type: 'incentive', staffId, reward: 'waffle_party', milestone /* 'launches'|'level' */, count /* the number reached */ }
```
- While the Incentives Program is on, a person earns the Waffle Party by crossing a big personal milestone: a set number of shipped launches they worked on, or a top level. Each person can win it at most once, and the company holds one at most every couple of in-game years, so a good run sees one to three. The thresholds live in `balance.js`.
- The timed reward ladder keeps its other rewards and no longer ends in the Waffle Party.
- Items carry an `outdoor` flag; the HQ roof terrace takes only outdoor items, and placement refuses others with 'Only outdoor items go on the terrace'.

### Per-person track record
```js
staff.record: {
  launches,        // shipped launches this person worked on (also drives the Waffle Party milestone)
  features,        // features built (engineering and design output, in whole features)
  prsMerged,       // flavour count derived from engineering output
  salesMrr,        // new MRR attributed to this person's sales work, in dollars
  deals,           // deals closed
  tickets,         // support tickets handled
  incidentsCaught, // incidents and rogue agents this person caught
  mentored,        // people this person mentored to a level-up
}
```
- Lifetime totals, starting at 0 on hire and kept when someone becomes an alum. Each counter only moves for work the person actually did, so a role's own numbers are the meaningful ones; ui shows the ones that fit the role.

## Staged props (#228)

Decisions whose text describes something physical show it in the office.

```js
// Event data (src/data/events.js), optional:
stage: { prop, anchor }            // anchor: 'wall' | 'subjectDesk' | 'kitchen' | 'door' | 'screens' | 'whiteboard'
// Choice data, optional:
grant:  { item }                   // buys and auto-places a real item (buyItem placement rules)
leaves: { prop, until, anchor }    // until: { item } | { weeks } | { flag }; anchor only when the event has no stage

state.pendingDecision.stage = null | { prop, anchor, x, y }   // tile resolved when raised; x, y null for 'screens'
state.office.props = [{ id, prop, x, y, since, until }]       // lingering props, at most B.officePropsMax (6), oldest dropped
```

- `prop` ids come from one shared prop set that art owns. sim may reference an id before art ships it; the renderer draws nothing for an unknown id.
- `grant` charges once. If the choice has a `cash` effect, that is the whole price and the item's own cost isn't added. Otherwise it charges the item's cost. The item's normal effects apply either way. If the item can't be placed, the choice is unavailable with the placement reason ('No room for it', 'Desk limit reached', 'Needs a bigger office'), never granted and refunded.
- `grant` replaces a `buyItem` effect on decisions.
- `until: { flag }` means the prop is removed once `state.flags[flag]` is set (truthy). `{ item }` means once an item of that id is placed. `{ weeks }` means that many weeks after `since`.
- An anchor of `'screens'` has no tile: the renderer shows the prop as an overlay on every monitor in the office, for as long as the decision is open. `leaves` can't use `'screens'`.
- An anchor of `'whiteboard'` resolves to a placed whiteboard or whiteboard_wall, else the back wall as `'wall'` does.
- `leaves` takes the stage prop's tile when there is one, and otherwise resolves its own `anchor`. The sim removes a prop once its `until` is met; the renderer diffs `office.props` and needs no new events.
- Old saves load with `office.props = []`.

## Yak reply prompts (#16)

Some staff posts in Yak carry two or three founder replies. They're small, low-stakes choices. Big-stakes choices stay as decision popups.

```js
state.chatPrompts = [ChatPrompt]   // open prompts, plus resolved ones kept for B.chatPromptsKept weeks so ui can show them as answered
ChatPrompt = {
  id,                // 'cp12', from its own sequence (state.flags.promptSeq), so prompt ids never shift other ids
  kind,              // template id in src/data/prompts.js, or the event id for an event delivered as a prompt
  chatId,            // the chatLog message the options hang under
  channel, fromId,   // copied from that message; fromId is a staff id, or null for bots
  week,              // week opened
  expiresWeek,       // resolves as ignored when state.week reaches it
  options: [{ label, hint, available, reason }],   // 2 or 3; hint states the effects, as decision choices do
  resolved: null | { choice, week, replyId },       // choice: index, or null when ignored; replyId: the founder's chat id, or null
  stage: null | { prop, anchor, x, y },            // an event delivered as a prompt keeps its staged prop, resolved as for pendingDecision.stage
  subjectId: null | staffId,                       // the event's subject, as pendingDecision.subjectId; moments cast the subject first
}
```

### Events: Yak reply prompts

```js
{ type: 'chatPrompt', promptId, chatId }            // a prompt opened; its chat event comes earlier in the same tick
{ type: 'chatPromptResolved', promptId, choice }    // choice: index, or null when it expired unanswered
```

### Actions: Yak reply prompts

```js
{ type: 'answerPrompt', promptId, choice }
// { ok: false, reason } with 'No such prompt' | 'Already answered' | 'That has gone quiet' | 'Invalid choice'
// or the option's own requirement reason (the same strings as decision choices)
```

- The founder's reply and the poster's follow-up are ordinary chat events with `replyTo = chatId`. The founder's line has `fromId` set to a founder's id.
- `answerPrompt` works while paused, like `resolveDecision`, and never opens a popup.
- At most `B.chatPromptsOpen` prompts are open at once. A new prompt opens at least `B.chatPromptGapWeeks` after the last one.
- Prompts are triggered by real state: strain or burnout, a live incident, a launch week, rival news, or a project running late.
- Option effects use the same keys as decision effects. An ignored prompt has its own small consequence, stated in its template.
- Copy follows the voice guide and the era gates.
- Prompt randomness (trigger rolls, template and text picks) comes from its own stream, seeded by the game seed, the week and `promptSeq`, so with prompts disabled a seeded game matches one without the feature.
- An event from `src/data/events.js` delivered as a prompt keeps its `stage`: the prop, and any moment the renderer plays for it, show in the office while the prompt is open, exactly as they would behind its decision card. Its choices' `grant` and `leaves` apply when it's answered, or with the default choice when it expires.
- For an event delivered as a prompt, the default choice when it expires is its mildest outcome: the smallest cost to the subject, or with no subject the smallest cost overall (no effect, if one choice has none). The player never takes a penalty for a prompt they may not have seen, and an unanswered prompt never grants an item or a pet: when the mildest choice would grant an item or a pet, the default is the mildest choice that doesn't. Small props a choice leaves behind are fine. Template prompts from `src/data/prompts.js` keep their own stated consequence for being ignored.
- Old saves load with `chatPrompts = []` and `flags.promptSeq = 0`.

## Yak quick posts (#16)

The founders can post a ready-made message in Yak. The team reacts, and a post that fits the moment lifts morale, while a badly timed one backfires.

```js
postOptions(state)   // pure export from src/sim/index.js
// -> [{ id, label, icon, hint, channel, available, reason, readyWeek }] in a fixed order
// [] when B.postsEnabled is false; ui hides the Post control when the list is empty
// id: 'pep_talk' | 'who_broke_prod' | 'meme' | 'pizza' | 'announcement'
// hint states the likely effect; channel is where the post appears; reason says why an unavailable post is greyed out;
// readyWeek is null when ready, else the week its cooldown ends
```

### Events: Yak quick posts

```js
{ type: 'posted', id, chatId, outcome }   // outcome: 'landed' | 'flat' | 'backfired'; the post's chat event comes earlier in the same dispatch
```

### Actions: Yak quick posts

```js
{ type: 'postMessage', id }
// { ok: true, outcome, chatId }
// or { ok: false, reason } with 'Unknown message' | 'Posted recently' | 'Ready in N weeks' | 'Not enough cash' | 'Posts are off'
```

- The post is an ordinary chat event with `fromId` set to a founder's id. It carries its final emoji reaction counts, picked for the outcome and the team's mood, so there is no separate reaction event.
- One to three staff replies follow over the next one or two ticks, as chat events with `replyTo` set to the post's id. They are queued in `state.flags.posts`.
- `postMessage` works while paused, like `answerPrompt`, and emits the post and `posted` from the dispatch itself.
- The cooldown, repeat memory and reply queue live in `state.flags.posts`, keyed by post id. Repeating a kind inside `B.posts.repeatWeeks` makes it `flat`: no effect, lukewarm replies.
- The outcome follows from state (an outage, low morale, recent news), not from a roll. Randomness picks only reactions, repliers and text, from its own stream seeded by the game seed, the week and a post sequence, so a game with no posts matches one without the feature.
- Bots never post.
- Every number is in `B.posts`, and `B.postsEnabled` turns the feature off.
- Copy follows the voice guide and the era gates.
- Old saves have no `flags.posts` and load with every post available.

## Growth events (#549)

People's growth is announced as events, so render, ui and audio can make it visible. Speech bubbles and the #wins lines stay. The sim emits no toast for a promotion or an earned trait: ui shows those from `promoted` and `traitEarned`.

### Events: Growth

```js
{ type: 'levelUp', staffId, level, gains }          // one per level gained; gains: { [skill]: n } added by that level
{ type: 'promoted', staffId, seniority }            // seniority: 'mid' | 'senior'; follows the levelUp that caused it, same tick
{ type: 'traitEarned', staffId, traitId, source }   // source: 'record' | 'training'
{ type: 'skillTrained', staffId, skill, gain }      // when a training program raises a skill
```

- Emitted by the tick (or by the `train` action, for `skillTrained`) exactly where the change happens. They draw no randomness, so balance can't move.
- Founders emit them too.
- The sim emits every event. Throttling at high speed is the job of render, ui and audio.
- The big tier uses state, not new events: `p.path` set by `choosePath`, and `p.legend`, which also keeps its existing `celebrate` event.
- No state or action changes, and old saves are unaffected.
