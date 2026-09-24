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
{ type: 'toast', text, tone }             // tone: info|good|warn|bad
{ type: 'chat', id, week, channel, from, fromId, text, replyTo, reactions }
                                          // channel: general|incidents|wins|random|standup; from: staff name or a bot handle like '@pagerbot'
                                          // fromId: staff id or null for bots; replyTo: chat id or null; reactions: { [emoji]: count }
{ type: 'launch', productId }
{ type: 'incident', kind, productId, caught, severity }
{ type: 'resign', staffId, name, fired }    // fired: true when the player fired them
{ type: 'hire', staffId }
{ type: 'decision' }
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
{ type: 'startProject', kind: 'new', name, category, angle, model, size }
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
// every option is optional; defaults: a random founder pair suited to building, 'bootstrapped'
```
The run starts at week 0 = January 2019 (dateOf(0).year === 2019).

### State additions and changes
```js
era: { id /* 'classic'|'chatgbt'|'agents'|'consolidation' */, since /* week */ },
eraSchedule: { chatgbt, agents, consolidation },          // arrival weeks for this run (jittered)
unlocks: { [key]: week },                                  // keys: 'marketing','ops','research','models','automation','paths','standups', 'policy.<id>'
goals: { [goalId]: { done /*bool*/, week /* or null */ } },
founding: { founders: [archetypeIds], funding, logoColor, tagline },
office: {
  stage /* 0|1|2, mirrors officeStage */,
  placed: [{ id, itemId, level /*1..3*/, x, y, rot /*0..3*/ }],   // tile coordinates on the stage grid
},
// REMOVED: items[] (the fixed-slot shop list); shop items are now entries in office.placed.
// gameOver.reason gains 'retired' (won: true, with retiredVia: 'ipo'|'acquired'); 'timeout' and the fixed run end are gone.
```
Grid: OFFICE_STAGES[stage].grid = { w, h }, .door = { x, y }, .blocked = [[x, y], ...]. Tile (0, 0) is the back corner where the two visible walls meet; x runs along the right-hand back wall, y along the left-hand back wall. Item footprints come from ITEMS[itemId].footprint = { w, h } before rotation (rot 1 and 3 swap w and h).

### Actions
```js
{ type: 'placeItem', itemId, x, y, rot }      // buys and places; returns { ok, id }; reasons include 'Blocked', 'Out of bounds', 'Would block the path to a desk', 'Not enough cash'
{ type: 'moveItem', id, x, y, rot }           // free
{ type: 'upgradeItem', id }
{ type: 'sellItem', id }                      // half refund of total spent
{ type: 'retire' }                            // valid when an IPO is available or an acquisition offer is open
// REMOVED: buyItem (placement replaces it)
// hire gains the reason 'No free desk'
```

### Events
```js
{ type: 'era', eraId }          // an era arrived (UI shows the era card)
{ type: 'unlock', key }         // a system unlocked (UI slides in the menu button and explainer card)
{ type: 'goal', goalId }        // a goal completed
```

## Speech vs Slackk

Speech bubbles in the office and Slackk messages are separate streams.

```js
{ type: 'say', id, week, staffId, text, toId, replyTo }   // spoken aloud in the office; toId: the person addressed (or null); replyTo: the say id this answers (or null)
```
- The renderer shows speech bubbles for `say` events only. A `chat` event is Slackk only; the renderer may show a small typing emote on the author's character, never a bubble.
- `say` events are never added to `chatLog` and never appear in Slackk.
- Spoken exchanges are between people in the office (not away); `toId` lets the renderer turn speakers toward each other.
