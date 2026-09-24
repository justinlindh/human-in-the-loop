# Human in the Loop Implementation Plan

> **For agentic workers:** This plan is executed by an agent team (lead plus four teammates). Each task names its lane. Read the spec, this plan's Global Constraints, the Contract section, and your lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build *Human in the Loop*, a complete, playable Kairosoft-style management sim about an AI-era SaaS company, rendered as a polished 3D isometric office diorama in the browser.

**Architecture:** A pure, seeded, deterministic simulation (`src/sim/`) owns all game state and runs headless in Node. Content lives in `src/data/`. A Three.js renderer (`src/render/`) and an HTML/CSS overlay (`src/ui/`) read state and sim events; the UI sends player actions through `dispatch`. A frozen contract (state shape, event shapes, action shapes) plus a mock sim lets the sim, render, and UI lanes build in parallel from day one.

**Tech Stack:** Node 25, Vite 8, Three.js 0.186 (`three/addons`), Vitest 5, Blender 5.2 (headless Python, glTF export), Playwright (headless screenshots), WebAudio, localStorage.

**Spec:** `docs/superpowers/specs/2026-09-23-human-in-the-loop-design.md`

## How this plan is written

Simulation tasks are specified to the formula and carry their test cases: the sim is where silent bugs hide, so its behavior is pinned exactly. Render and UI tasks carry the interfaces, the acceptance criteria, and the verification procedure (screenshots against the art bar), not every line of code: those are creative, iterative tasks and pre-writing their code would produce worse art. Every task still ends with a concrete, checkable deliverable.

## Team and lanes

| Lane | Agent (`.claude/agents/`) | Owns (only this lane edits these paths) |
|---|---|---|
| L | lead (main session) | `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `src/contract/`, `src/dev/`, `scripts/snap.js`, merges |
| S | `sim-engineer` | `src/sim/`, `src/data/`, `src/save/`, `tests/`, `scripts/balance.js` |
| A | `art-director` | `src/render/`, `blender/`, `public/models/`, `scripts/build-models.sh` |
| U | `ui-engineer` | `src/ui/`, `src/audio/` |
| R | `game-reviewer` | nothing (read-only review, playtests, reports findings) |

- Each builder works in its own git worktree on branch `lane/<sim|art|ui>`, cut from `feat/one-shot` after Task L0 merges.
- Builders commit on their lane branch and message the lead when a task is done. The lead asks the reviewer to review, then merges into `feat/one-shot`. Lane branches are local and unpushed, so rebasing a lane branch onto `feat/one-shot` before merge is allowed and expected.
- Need a change outside your lane? Message the owner. Need a contract change? Message the lead; only the lead edits `src/contract/`.
- Chrome (the real browser) belongs to the reviewer and lead. Builders verify visuals with `npm run snap` (headless Playwright).

## Global Constraints

- No em dash characters (U+2014) anywhere: files, commits, messages. A hook blocks them.
- Game text says "company" or "lab", never "startup", except inside a parody joke.
- No changelog, dated, or environment-state comments in source. Comments explain non-obvious code as it is now, briefly.
- `src/sim/**` must not import `three`, touch `document`/`window`/`localStorage`, or call `Math.random`/`Date.now`. All randomness goes through `src/sim/rng.js`, whose state lives in game state.
- `src/render/**` and `src/ui/**` never mutate game state. UI changes state only via `dispatch(state, action)`.
- All tunable numbers live in `src/sim/balance.js` (`B`).
- Run: 15 in-game years from 2026, weekly ticks (780 weeks). Speeds: pause, 1x (1 week per 2.0 s), 2x, 4x.
- Lose: cash below zero for 8 consecutive weeks, or lab collapse. Win: IPO, accepted acquisition, or category leader in 3+ categories at run end.
- Balance thresholds (asserted): automate-everything bot loses in at least 70% of seeds; all-humans bot fails to win in at least 70% of seeds; balanced bot wins in 30% to 90% of seeds.
- Office stages: Garage, Office Floor, HQ Building.
- Content minimums: 14 categories, 7 angles, 7 models, 14 incumbents, 40+ events, 20+ traits, 6 policies.
- Zero console errors in playtest. Target 60 fps at 1920x1080 on High quality with 30 staff; Low quality disables GTAO, bloom, and tilt-shift.
- Never commit to `main`. Integration branch is `feat/one-shot`.

## Review Focus

- **Corrupt or old save data:** Continue must not crash; invalid JSON or a mismatched `version` shows a message on the title screen and allows New Game. Pinned in Task S12.
- **Unaffordable or invalid actions** (no cash, office full, no staff, missing target): `dispatch` returns `{ ok: false, reason }` with state byte-identical; UI shows the reason as a toast. Pinned in Tasks S3, S4, S6 and U2.
- **Everyone quits, zero customers, zero products:** no NaN or Infinity anywhere in state; projects stall. Pinned by the `assertFinite` invariant run every bot week in Task S13.
- **Long sessions at 4x:** bubble, toast, and chat DOM nodes and 3D label objects stay bounded; `history` capped at `B.maxHistory`; hidden tabs never burst catch-up ticks. Pinned in Tasks A6, U1, L1.
- **Resize and small windows (down to 1024x640):** canvas, composer, and label layer resize together; panels scroll instead of overflowing. Pinned in Tasks A1, U1 and the L2 playtest at two sizes.

---

## The Contract (Task L0 writes this into `src/contract/contract.md`)

### Sim API

```js
// src/sim/index.js public surface
createGame({ seed, companyName }) -> State
tick(state) -> SimEvent[]              // advances one week, mutates state; returns [] if gameOver or pendingDecision
dispatch(state, action) -> { ok, reason?, events: SimEvent[] }   // immediate, works while paused
dateOf(week) -> { year, yearIndex, week, quarter }
productAppeal(state, product) -> number
oversightRequired(state) -> hours; oversightProvided(state) -> hours
securityPosture(state) -> 0..100
scoreRun(state) -> { score, valuation, breakdown }
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
  discoveredCombos: { ['cat:angle']: fitNumber },
  outage: null | { productId, kind, severity, weeks, unrecoverable },
  incidentLog: [{ week, kind, productId, caught, severity }],   // last 30
  lowCashWeeks,
  pendingDecision: null | { eventId, title, text, subjectId, choices: [{ label, hint }] },
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
  appearance: { skin /*0..5*/, hair /*0..7*/, hairColor /*hex*/, shirt /*hex*/, pants /*hex*/, accessory /*none|glasses|headphones|beanie|cap*/, build /*0..2*/ },
}

Project = {
  id, kind /*new|update|migration|refactor|craft*/, name, category, angle, model, size /*small|medium|large*/,
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
{ type: 'chat', from, text }              // from: staff name or a bot handle like '@pagerbot'
{ type: 'launch', productId }
{ type: 'incident', kind, productId, caught, severity }
{ type: 'resign', staffId, name }
{ type: 'hire', staffId }
{ type: 'decision' }
{ type: 'officeUpgrade', stage }
{ type: 'celebrate', staffId }            // staffId may be null for company-wide
{ type: 'award', text }
{ type: 'gameOver' }
```

### Actions (`dispatch` payloads)

```js
{ type: 'hire', candidateId }
{ type: 'fire', staffId }
{ type: 'assign', staffId, assignment: { type, targetId } }
{ type: 'train', staffId }
{ type: 'startProject', kind: 'new', name, category, angle, model, size }
{ type: 'startProject', kind: 'update'|'migration', productId }
{ type: 'startProject', kind: 'refactor'|'craft' }
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

## Phase 0 (lead, sequential, before the team starts)

### Task P0: Team infrastructure

**Lane:** L. **Files:** `CLAUDE.md`, `.claude/agents/{sim-engineer,art-director,ui-engineer,game-reviewer}.md`, `.claude/skills/{art-direction,blender-pipeline,playtest,balance-tuning}/SKILL.md`.

- [ ] Write the files (drafted alongside this plan, reviewed by the user before the team starts).
- [ ] Commit `Add project CLAUDE.md, team agent definitions, and skills`.

### Task L0: Scaffold, contract, mock sim, snapshot tool

**Lane:** L. **Files:** `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `src/main.js`, `src/contract/contract.md` (the Contract section above, verbatim), `src/contract/events.js`, `src/dev/mockSim.js`, `scripts/snap.js`, `tests/contract.test.js`.

**Produces:**
- `src/contract/events.js`: `EVENT_TYPES` (the type strings above) and `ACTION_TYPES`.
- `src/dev/mockSim.js`: `createMockSim({ scenario })` returning `{ state, tick() -> SimEvent[], dispatch(action) -> { ok, events } }` with the real API shape. Scenarios: `garage` (2 staff, no products), `floor` (10 staff in mixed moods and assignments, 3 products, one campaign, a trend), `hq` (28 staff, 8 products, automation mid-level), `incident` (floor plus an active unrecoverable outage and a pending decision), `night` (floor, flagged so the renderer shows night). Its `tick()` advances `week`, jitters meaning and customers, and emits a plausible mix of every event type so render and UI exercise every path.
- `src/main.js` reads `?mock=<scenario>` and `?seed=<n>`; with `mock` it uses `createMockSim`, otherwise the real sim once merged.
- `scripts/snap.js`: `npm run snap -- --scenario floor --out shots/floor.png [--width 1920 --height 1080] [--quality high] [--wait 2500] [--time night] [--speed 4]`. Starts Vite programmatically (or reuses a dev server on 5173), opens headless Chromium via Playwright with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, loads `/?mock=<scenario>&snap=1`, waits for `window.__HITL_READY === true` plus the wait time, writes the PNG, prints console errors, exits non-zero on any console error. `shots/` is gitignored.

- [ ] **Step 1:** `git checkout -b feat/one-shot` from `design/human-in-the-loop`. `npm init -y`, `npm i three@0.186.0`, `npm i -D vite@8 vitest@5 playwright`, `npx playwright install chromium`. Scripts: `dev`, `build`, `preview`, `test` (`vitest run`), `balance` (`node scripts/balance.js`), `snap` (`node scripts/snap.js`), `models` (`bash scripts/build-models.sh`).
- [ ] **Step 2:** `index.html` with `<canvas id="scene">`, `<div id="labels">`, `<div id="ui">`, Google Fonts Fredoka (400 to 700) and JetBrains Mono (500). `vite.config.js` sets `test: { include: ['tests/**/*.test.js'], environment: 'node' }`.
- [ ] **Step 3: Test** `tests/contract.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createMockSim } from '../src/dev/mockSim.js';
import { EVENT_TYPES } from '../src/contract/events.js';

const walkFinite = (v) => {
  if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  else if (v && typeof v === 'object') Object.values(v).forEach(walkFinite);
};

describe('mock sim honors the contract', () => {
  for (const scenario of ['garage', 'floor', 'hq', 'incident', 'night']) {
    it(`${scenario}: state is JSON-safe and finite`, () => {
      const m = createMockSim({ scenario });
      walkFinite(JSON.parse(JSON.stringify(m.state)));
    });
  }
  it('emits every event type within 60 ticks of the floor scenario', () => {
    const m = createMockSim({ scenario: 'floor' });
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      if (m.state.pendingDecision) m.dispatch({ type: 'resolveDecision', choice: 0 });
      for (const e of m.tick()) seen.add(e.type);
    }
    for (const t of EVENT_TYPES) expect(seen.has(t), t).toBe(true);
  });
  it('hq scenario fits HQ capacity', () => {
    expect(createMockSim({ scenario: 'hq' }).state.staff.length).toBeLessThanOrEqual(30);
  });
});
```

- [ ] **Step 4:** Implement until `npm test` passes. `src/main.js` for now: with `?mock`, render a placeholder `<pre>` of a state summary and set `window.__HITL_READY = true`. Verify `npm run snap -- --scenario floor --out shots/floor.png` writes a PNG and exits 0.
- [ ] **Step 5:** Commit `Scaffold project, freeze sim contract, add mock sim and headless snapshot tool`. Create lane worktrees: `git worktree add ../gamedev-sim -b lane/sim`, `../gamedev-art -b lane/art`, `../gamedev-ui -b lane/ui`; run `npm ci` in each.

---

## Lane S: Simulation (sim-engineer)

All tasks: TDD with Vitest under `tests/sim/`. Every constant comes from `B`. Each system file calls `registerSystem(name, fn, order)` and/or `registerAction(type, fn)` at import, and `src/sim/index.js` imports it. The weekly order is fixed in S2. Test names below are the minimum set; add more where a formula has an edge.

### Task S1: RNG, utilities, content data

**Files:** `src/sim/rng.js`, `src/sim/util.js`, `src/data/*.js`, `tests/sim/rng.test.js`, `tests/sim/util.test.js`, `tests/sim/data.test.js`.

**Produces:** `createRng(seed) -> { s }` (mulberry32; the object is mutated), `next(r)`, `range(r,a,b)`, `int(r,a,b)` inclusive, `pick(r,arr)`, `chance(r,p)`, `weighted(r, items, weightFn)`, `shuffle(r, arr)` (new array). `clamp`, `sum(arr, fn?)`, `avg(arr, fn?)` (0 when empty), `round(v, dp)`, `newId(state, prefix)` (uses `state.nextId++`), `dateOf(week)`.

mulberry32:

```js
export function next(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
```

Data modules (exact fields and values):

`categories.js` `CATEGORIES`: `{ id, name, tam, price, unlockYear, compliance, icon }` (icon: one emoji).

| id | name | tam | price | unlockYear | compliance |
|---|---|---|---|---|---|
| notes | Notes | 180000 | 12 | 2026 | no |
| email | Email | 220000 | 10 | 2026 | no |
| pm | Project Management | 120000 | 25 | 2026 | no |
| support | Support Desk | 60000 | 60 | 2026 | no |
| crm | CRM | 80000 | 70 | 2027 | no |
| analytics | Analytics | 70000 | 55 | 2027 | no |
| design | Design Tools | 90000 | 30 | 2028 | no |
| devtools | Dev Tools | 100000 | 35 | 2028 | no |
| hr | HR | 40000 | 90 | 2029 | yes |
| recruiting | Recruiting | 35000 | 110 | 2029 | yes |
| accounting | Accounting | 50000 | 95 | 2030 | yes |
| video | Video Editing | 110000 | 28 | 2030 | no |
| legal | Legal | 20000 | 250 | 2031 | yes |
| security | Security | 30000 | 180 | 2032 | yes |

`angles.js` `ANGLES`: `{ id, name, unlockYear, agentic, blurb }`: copilot (Copilot, 2026, no), summarizer (Summarizer, 2026, no), workflow (Workflow Automation, 2026, yes), agent (Autonomous Agent, 2027, yes), native (AI-native Rebuild, 2027, no), voice (Voice-first, 2028, no), vertical (Vertical Fine-tune, 2029, no). One funny blurb line each.

`combos.js`: `COMBO_OVERRIDES` plus `comboFit(cat, angle)` returning the override or 1.0. Overrides: support:agent 1.5, email:summarizer 1.45, notes:summarizer 1.3, pm:workflow 1.4, crm:agent 1.35, analytics:copilot 1.3, design:copilot 1.35, devtools:agent 1.45, devtools:copilot 1.4, hr:workflow 1.3, recruiting:agent 1.3, accounting:vertical 1.45, legal:vertical 1.5, legal:summarizer 1.4, video:native 1.35, video:voice 1.2, security:agent 1.3, security:vertical 1.4, support:voice 1.3, crm:voice 1.2, notes:voice 1.15, email:agent 1.25, pm:summarizer 1.2, email:native 0.7, notes:native 0.75, legal:voice 0.65, accounting:voice 0.6, security:voice 0.6, video:summarizer 0.8, design:summarizer 0.7, hr:voice 0.75, analytics:voice 0.7, legal:agent 0.8, accounting:agent 0.85.

`incumbents.js` `INCUMBENTS`: `{ id, name, category, strength, wink }`: Notian/notes/420, Gmale/email/600, Jirra/pm/480, Zendisk/support/360, Salesfarce/crm/650, Lookerish/analytics/380, Figmo/design/560, GitHug/devtools/620, Workdai/hr/520, LinkedOut/recruiting/540, Quickbucks/accounting/580, Adobo Premiere/video/500, LexisNaxis/legal/460, CrowdStrife/security/600.

`models.js` `MODELS`: `{ id, name, wink, capability, productCost, autoCost, guardrails, trust, complianceOk, selfHosted, releaseYear, color, blurb }`. productCost is dollars per customer per month; autoCost is dollars per week at automation level 1 for one function.

| id | name | cap | productCost | autoCost | guardrails | trust | complianceOk | selfHosted | release | color |
|---|---|---|---|---|---|---|---|---|---|---|
| claudius | Claudius | 80 | 2.4 | 1500 | 0.9 | 0.8 | yes | no | 2026 | #d97757 |
| chatgbt | ChatGBT | 78 | 2.0 | 1300 | 0.7 | 0.9 | yes | no | 2026 | #10a37f |
| gemenai | Gemenai | 74 | 1.3 | 900 | 0.65 | 0.7 | yes | no | 2026 | #4b8bf5 |
| grokk | Grokk | 70 | 1.0 | 700 | 0.25 | 0.35 | no | no | 2026 | #8a8a8a |
| llamarama | Llamarama | 66 | 0.6 | 600 | 0.45 | 0.55 | yes | yes | 2026 | #6b5bd6 |
| deepsleep | DeepSleep | 76 | 0.5 | 450 | 0.5 | 0.4 | no | no | 2026 | #3a5ccc |
| mistrale | Mistrale | 70 | 1.2 | 850 | 0.6 | 0.65 | yes | no | 2027 | #f5a524 |

Blurbs in the spec's voice (Claudius "will politely decline to delete prod", Grokk "has opinions about your customers", Mistrale "comes with a small baguette", and so on).

`roles.js` `ROLES` keyed by id: `{ id, name, color, automatedBy: { fn: weight }, defaultAssignment }`: engineer `{engineering:1, qa:0.5, ops:0.4}` maintenance #4f8cff; designer `{engineering:0.35}` idle #ff7eb6; marketer `{marketing:1}` marketing #ffb020; support `{support:1}` support #34c38f; security `{ops:0.6}` security #e5484d; sales `{sales:1}` sales #9b6bff.

`traits.js` `TRAITS` (22): `{ id, name, desc, mods }`. Mod keys: `output, meaningDrain, meaningRecovery, mentorBonus, xp, hype, oversight, stamina, features, polish, reliability, novelty, resign, salary` (multipliers, default 1) and `catch` (additive, default 0). Entries: craftsperson {polish 1.3, meaningDrain 1.5, meaningRecovery 1.2}, hype_machine {hype 1.5}, paranoid {oversight 1.4, catch 0.15}, mentor {mentorBonus 1.6, meaningRecovery 1.2}, night_owl {output 1.1, stamina 1.2}, vibe_coder {features 1.3, reliability 0.7, meaningDrain 0.5}, burnout_prone {output 1.15, stamina 1.5}, loyal {resign 0.4}, job_hopper {resign 1.8}, tinkerer {novelty 1.3, xp 1.2}, pragmatist {meaningDrain 0.6, reliability 1.1}, perfectionist {output 0.85, reliability 1.3, polish 1.2}, fast_learner {xp 1.5}, old_guard {reliability 1.2, meaningDrain 1.3, catch 0.1}, ai_enthusiast {meaningDrain 0.3, oversight 1.2}, people_person {hype 1.2, meaningRecovery 1.1}, lone_wolf {output 1.15, mentorBonus 0.6}, caffeinated {output 1.1, stamina 1.1}, visionary {novelty 1.4}, steady {stamina 0.7, resign 0.7}, cynic {meaningRecovery 0.7, reliability 1.15}, red_teamer {catch 0.2, oversight 1.2}. One-line descs.

`names.js`: `FIRST_NAMES`, `LAST_NAMES`, 60+ each, diverse across cultures and genders.

`policies.js` `POLICIES`: `{ id, name, desc, weeklyCost, unlock(state) }`: pair (AI as Pair, Not Replacement; 0; always), craft_fridays (Craft Fridays; 0; always), blameless (Blameless Postmortems; 200; `stats.incidents >= 1`), comprehension_reviews (Code Comprehension Reviews; 0; `comprehensionDebt >= 20 || officeStage >= 1`), apprenticeship (Apprenticeship Program; 1500; `officeStage >= 1`), sabbatical (Sabbatical Program; 500; `officeStage >= 1`). Descs state the trade-off plainly.

`channels.js` `CHANNELS`: `{ id, name, cost, weeks, hype, brand, minStage, desc }`: launch 5000/3/9/0.4/0, content 2500/8/2/0.5/0, producthunt 1500/1/22/0.6/0, community 3000/12/1.5/0.7/0, ads 12000/4/8/0.1/0, influencer 20000/2/20/0.2/1, conference 35000/2/14/1.5/1, enterprise 30000/10/2/0.8/1.

`office.js` `OFFICE_STAGES`: `{ id, name, capacity, rent, upgradeCost, size: [w, d] }`: garage 4/300/0/[10,8], floor 12/3500/60000/[18,14], hq 30/14000/400000/[28,22]. Desk layout belongs to the renderer.

`trends.js` `TRENDS`: `{ id, name, text, weeks, angleMods, categoryMods }`: agents_hot (26; agent 1.4, workflow 1.2), ai_fatigue (26; copilot 0.7, native 0.7), compliance (39; agent 0.8 | hr 0.8, legal 1.2, accounting 1.1), voice_boom (26; voice 1.5), budget_cuts (13; none | crm 0.8, analytics 0.85, pm 0.85), remote_wave (26; summarizer 1.3 | notes 1.2, pm 1.2), security_scare (26; none | security 1.5, devtools 1.1), creator_economy (26; native 1.2 | video 1.4, design 1.2), steady (13; none).

`press.js`: `PRESS` (TechCrunchy, The Vergence, Hacker Olds, Wired-ish) and `REVIEW_QUOTES` keyed `low|mid|high`, 8+ each (high: "Finally, AI that earns its keep."; low: "It is a chat box wearing a trench coat.").

`chatter.js` `CHATTER`: keys `happy, coasting, burnout, automated, mentor, junior, incident, idle, overseer`, 6+ lines each, under 60 characters, warm and funny (automated: "My job is now clicking Approve").

`events.js` `EVENTS` and `epilogues.js` `EPILOGUES`: schemas and full lists in S11 and S12. Write them in this task so the data tests cover them.

**Tests:**
- `data.test.js`: scope minimums; unique ids per array; exactly one incumbent per category; at least 4 categories and 3 angles unlocked in 2026; `comboFit` within [0.6, 1.5] for every pair; model stats in range and at least 5 available in 2026; `Object.keys(ROLES).sort()` equals the six roles; each event has `title`, `text`, and a `choices` array or `auto` object; every chatter key has 6+ lines; serialized player-facing data contains no em dash (build the character with `String.fromCharCode(0x2014)` so the test file itself stays clean) and does not match `/startup/i`.
- `rng.test.js`: determinism per seed; differs across seeds; JSON round trip resumes identically; `int` inclusive; `shuffle` leaves input untouched; `weighted` never returns a zero-weight item when a positive one exists.
- `util.test.js`: empty `sum`/`avg` are 0; `dateOf(0)` equals `{ year: 2026, yearIndex: 0, week: 1, quarter: 1 }`; `dateOf(52).year === 2027`; `dateOf(51).quarter === 4`.

- [ ] TDD cycle; commit `Add RNG, utilities, and game content data`.

### Task S2: Balance constants, state, tick, dispatch

**Files:** `src/sim/balance.js`, `src/sim/state.js`, `src/sim/tick.js`, `src/sim/actions.js`, `src/sim/index.js`, `tests/sim/state.test.js`.

**Produces:** `createGame`, `registerSystem(name, fn, order)`, `makeCtx(state) -> { state, rng, events, emit }`, `tick`, `registerAction(type, fn)`, `dispatch`. Action handlers validate and return `{ ok: false, reason }` before mutating anything.

`tick(state)`: return `[]` if `gameOver` or `pendingDecision`; otherwise run systems in ascending `order`, stop early once `gameOver` is set, then `state.week++`. Order:

```
10 calendar-start  unlocks, trend countdown, vendor releases        S9
20 work            people and automation output                     S4
30 projects        progress, completion, launch                     S4
40 products        customers, churn, mrr, health, uptime            S5
45 marketing       campaigns, hype, brand                           S6
50 meaning         drain, recovery, moods, resignations             S7
55 knowledge       staff knowledge, IK, comprehension debt          S8
60 market          clones, incumbents copy                          S9
65 incidents       rogue agents, cyber, outages                     S10
70 events          random events, decisions                         S11
75 annual          expo, awards, year summary                       S11
80 economy         costs, revenue, runway                           S5
85 staff-upkeep    xp, levels, candidates, stamina, sabbaticals     S3
90 endgame         win and lose                                     S12
95 history         weekly snapshot                                  S12
```

`createGame`: every Contract State field present. `cash = B.startCash`, `brand = B.startBrand`, `institutionalKnowledge = 60`, `comprehensionDebt = 0`, automation levels 0 on `chatgbt`, `ops` zeros, market categories from incumbents, unlocked lists from 2026 data, models from data (`available = releaseYear <= 2026`), trend `steady` with 13 weeks left, empty `incidentLog`. Two founders: a senior engineer and a mid designer with `knowledge 70`, `meaning 85`, `founder: true`, both assigned to `idle` until the first project. Then `refreshCandidates`.

`balance.js` (the only place to tune):

```js
export const B = {
  runWeeks: 780, startCash: 90000, startBrand: 5, runwayLoseWeeks: 8, maxHistory: 800,
  salary: { junior: 900, mid: 1600, senior: 2600 }, hireFeeWeeks: 2,
  candidateRefreshWeeks: 4, candidateCount: 5, trainingCost: 3000, trainingXp: 40,
  xpPerLevel: 60, xpPerWeekWorking: 8, promoteMidLevel: 5, promoteSeniorLevel: 10, maxLevel: 20,
  juniorXpAutomationPenalty: 0.7, mentorXpMult: 2.2, mentorOutputMult: 0.6,
  basePoints: 4, pointsPerLevel: 1.1,
  roleWeights: {
    engineer: { features: 0.45, reliability: 0.35, novelty: 0.1, polish: 0.1 },
    designer: { features: 0.2, reliability: 0, novelty: 0.3, polish: 0.5 },
    marketer: { features: 0, reliability: 0, novelty: 0.3, polish: 0.1 },
    security: { features: 0, reliability: 0.4, novelty: 0, polish: 0 },
    support: { features: 0.05, reliability: 0.1, novelty: 0, polish: 0.1 },
    sales: { features: 0.05, reliability: 0, novelty: 0.05, polish: 0 },
  },
  seniorityOutput: { junior: 0.6, mid: 1.0, senior: 1.45 },
  hardProblemNovelty: 6, craftFridaysOutput: 0.9, comprehensionReviewSpeed: 0.85,
  autoEngPoints: 16, autoEngWeights: { features: 0.55, reliability: 0.25, novelty: 0.05, polish: 0.15 },
  pairAutoMult: 0.6, pairMeaningDrainMult: 0.3,
  oversightHoursPerLevel: { engineering: 20, support: 14, sales: 8, marketing: 6, qa: 10, ops: 24 },
  oversightHoursPerPerson: 20,
  supportHoursPerCustomer: 1 / 150, supportHoursPerPerson: 40, autoSupportHours: 160,
  salesCloseBoostPerPerson: 0.006, autoSalesBoost: 0.008,
  meaningDrain: { junior: 0.6, mid: 1.1, senior: 1.8 }, meaningBaseRecovery: 0.35,
  meaningRecovery: { mentor: 1.2, mentee: 0.6, hardProblem: 1.6, craft: 1.1, sabbatical: 4, oversight: 0.4, craftFridays: 0.5, owner: 0.4 },
  meaningCatchBonus: 12, meaningAwardBonus: 8, meaningLaunchBonus: 4,
  coastingBelow: 35, burnoutBelow: 15, coastingOutput: 0.6, burnoutOutput: 0.2,
  resignChance: { coasting: 0.01, burnout: 0.07 }, burnoutWeeksBeforeResign: 3, sabbaticalWeeks: 4,
  staminaDrainWorking: 0.6, staminaRecovery: 1.2, staminaLowBelow: 25,
  knowledgeGainWorking: 0.5, knowledgeGainMentee: 1.0, newHireKnowledge: 10,
  ikBaseline: 2, ikPerProduct: 1.2,
  debtFromEngAuto: 1.1, debtFromQaAuto: 0.35, debtFromOpsAuto: 0.3, debtPerProduct: 0.04,
  debtPaydownPerSeniorEng: 0.35, debtPaydownReviews: 0.9, debtPaydownRefactor: 15,
  debtFromDeparturePerKnowledge: 0.12, debtLowIkThreshold: 40, debtLowIkRate: 0.03,
  sizes: { small: { points: 110, cost: 2000, minStage: 0 }, medium: { points: 280, cost: 8000, minStage: 0 }, large: { points: 650, cost: 25000, minStage: 1 } },
  pointsGrowthPerYear: 0.1, expectationGrowth: 0.1, reviewScale: 6.2, reviewNoise: 0.9, balancePenaltyBelow: 0.08,
  migrationPoints: 70, updatePointsMult: 0.6, refactorPoints: 120, craftPoints: 90,
  appealExp: 1.5, incumbentStrengthGrowth: 0.03, cloneStrength: 18,
  acquisitionRate: 0.025, hypeAcquisition: 0.0012,
  baseChurn: 0.008, minChurn: 0.002, churnBrandRelief: 0.00004, wrapperChurn: 0.02, supportShortfallChurn: 0.02, outageChurn: 0.05,
  maintenancePerProduct: 3, maintenancePerCustomer: 1 / 4000, healthDecay: 6, healthRecovery: 1, uptimeFloor: 0.5,
  noveltyDecay: 0.04, enterpriseComplianceMult: 0.75,
  hypeDecay: 0.08, brandDecay: 0.03, marketerHypePerWeek: 1.2, autoMarketingHype: 0.4,
  autoMarketingBrandPenalty: 0.6, wrapperGap: 2.5, wrapperBrandHit: 4,
  cloneChanceBase: 0.012, cloneChanceYearGrowth: 0.35, cloneDecay: 0.01,
  copyDelayWeeks: [26, 52], copyNoveltyMult: 0.5, copyIncumbentMult: 1.08,
  vendorReleaseEveryWeeks: 26, vendorCapabilityStep: 7, deprecateChance: 0.5, priceHikeChance: 0.08,
  migrationDeadlineWeeks: 26, missedMigrationHealth: 3, priceHikeMult: 1.3,
  rogueBase: 0.03, rogueShortfallFloor: 0.15, catchBase: 0.75, catchMax: 0.95, caughtDamageMult: 0.2,
  cyberBase: 0.006, cyberPerMrr: 0.00000004, cyberMax: 0.12,
  incidentCashPerSeverity: 4000, incidentCashYearGrowth: 0.3, outageMinSeverity: 3,
  postureSecurityPerSkill: 0.6, postureAudit: 20, postureAuditDecay: 0.4, postureTooling: 12, postureDebtPenalty: 0.5,
  auditCost: 15000, toolingWeekly: 900, consultantCost: 45000,
  outageCollapseWeeks: 6, collapseMrrShare: 0.5,
  gpuWeeklySelfHost: 1200, randomEventChance: 0.33,
  ipoMrr: 1500000, ipoBrand: 60, acquisitionOfferMrr: 250000, leaderCategoriesToWin: 3,
};
```

**Tests** (`state.test.js`): a fresh game has week 0, stage 0, 2 staff, positive cash, `Object.keys(automation)` equal to `FUNCTIONS`, candidates present, and every Contract State key; same seed plus 20 ticks gives identical JSON; tick increments week; tick is a no-op with `pendingDecision` or `gameOver`; an unknown action returns `ok: false` and state JSON is unchanged; JSON round trip then tick matches ticking the original.

- [ ] TDD cycle; commit `Add balance constants, game state, tick and dispatch`.

### Task S3: Staff, hiring, growth

**Files:** `src/sim/staff.js`, `tests/sim/staff.test.js`.

**Produces:** `generateStaff(state, { role, seniority }) -> Staff` (not added to state), `refreshCandidates(state)`, `staffMods(person)` (merged trait mods), `outputMult(state, person)`, `capacity(state)`. Actions `hire`, `fire`, `assign`, `train`. System `staff-upkeep` (85).

Rules:
- `generateStaff`: name from lists; skills by seniority (junior 15 to 35, mid 35 to 60, senior 60 to 85) per stat, x1.3 on the role's top two `roleWeights` stats, clamped 1 to 100, rounded; level junior 1 to 2, mid 5 to 7, senior 10 to 13; `xp 0`; speed 0.8 to 1.2 (2 dp); meaning 70 to 90; stamina 100; knowledge `B.newHireKnowledge`; 0 to 2 distinct traits; salary `B.salary[seniority] * mods.salary * range(0.9, 1.1)` rounded to 10; appearance random from fixed palettes (10 shirt hexes, 8 hair hexes, 6 pants hexes); assignment `{ type: ROLES[role].defaultAssignment, targetId: null }`; mood `ok`; `burnoutWeeks 0`; `sabbaticalWeeksLeft 0`; `founder false`.
- `outputMult(state, person) = B.seniorityOutput[seniority] * speed * moodMult * staminaMult * mods.output * (policies.craft_fridays ? B.craftFridaysOutput : 1)`; `moodMult` ok 1, coasting `B.coastingOutput`, burnout `B.burnoutOutput`, away 0; `staminaMult = stamina < B.staminaLowBelow ? 0.7 : 1`.
- `refreshCandidates`: `B.candidateCount` people; seniority senior 20%, mid 40%, junior 40%; with policy `apprenticeship` juniors get +10 to every skill; role weights engineer 35, others 13 each; sets `candidatesWeek = week`.
- `hire`: reasons "No such candidate", "Office is full", "Not enough cash" (needs `salary * B.hireFeeWeeks`). On success: remove from candidates, `hiredWeek = week`, push, deduct fee, `stats.hires++`, `stats.juniorsHired++` for juniors, emit `hire` and a `chat` hello line.
- `fire`: "No such staff member", "Founders cannot be fired". Removes the person, calls `onDeparture` (S8), clears mentor links targeting them and product ownership.
- `assign`: validates: `project` target exists; `mentor` requires mid or senior and a junior target (not self); `hardProblem` requires senior; `sabbatical` requires policy `sabbatical` and a non-away person, sets mood `away` and `sabbaticalWeeksLeft = B.sabbaticalWeeks`; unknown type fails. Reasons are short and specific.
- `train`: "Not enough cash"; costs `B.trainingCost`, adds `B.trainingXp * mods.xp` xp, emits a `bubble` "+XP" tone `good`.
- `staff-upkeep`: working staff (any assignment except idle and away) gain `B.xpPerWeekWorking * mods.xp` xp; juniors not mentored lose `B.juniorXpAutomationPenalty * automation.engineering.level` of that share; mentored juniors multiply by `B.mentorXpMult * mentor mods.mentorBonus`. Level up when `xp >= B.xpPerLevel * level` (carry remainder), +2 to +4 to the role's top two skills, cap `B.maxLevel`. Promote junior to mid at `B.promoteMidLevel`, mid to senior at `B.promoteSeniorLevel`; salary moves to the new band; toast and `celebrate`. Stamina: working `-B.staminaDrainWorking * mods.stamina`, idle `+B.staminaRecovery * 2`, otherwise `+B.staminaRecovery * 0.5`, clamp 0..100. Sabbatical countdown; on return mood `ok` and default assignment. Refresh candidates every `B.candidateRefreshWeeks`.

**Tests:** generated staff match the Contract shape and ranges for every role and seniority; `hire` success (fee deducted, stats incremented, candidate removed, event emitted); each `hire` failure returns its reason with state JSON unchanged (cash short, office at capacity 4, bad id); `fire` refuses founders; `assign` validation (junior cannot mentor, mentor target must be a junior, hardProblem needs senior, sabbatical needs the policy); an unmentored junior levels slower at engineering automation 1.0 than at 0, and a mentored one faster than both; a junior reaches mid after enough weeks; candidates refresh every 4 weeks; determinism.

- [ ] TDD cycle; commit `Add staff generation, hiring, assignments, and growth`.

### Task S4: Work output, projects, reviews, launches

**Files:** `src/sim/work.js`, `src/sim/projects.js`, `tests/sim/projects.test.js`.

**Produces:** `personPoints(state, person) -> { features, polish, reliability, novelty }`, `automationPoints(state) -> same shape`, `state.ops.maintenanceCapacity` written each week, action `startProject`, systems `work` (20) and `projects` (30), `reviewScore(state, project)`, `trendMods(state, category, angle) -> number`.

Formulas:
- `personPoints[stat] = (B.basePoints + B.pointsPerLevel * level) * outputMult * B.roleWeights[role][stat] * (0.5 + skills[stat] / 100) * mods[stat]`; mentors multiply by `B.mentorOutputMult`.
- `work` system: each project gets a fresh week-points scratch (a local map, not persisted). Staff with `assignment.type === 'project'` add `personPoints` to their project. `hardProblem` seniors add `B.hardProblemNovelty * outputMult` novelty split across active `new` and `update` projects. Engineers on `maintenance` add `features + reliability` of their `personPoints` to maintenance capacity. Automation: `lvl = automation.engineering.level`, `cap = models[model].capability / 100`, `mult = policies.pair ? B.pairAutoMult : 1`, weekly `total = B.autoEngPoints * lvl * cap * mult`; with at least one active project each project receives `total * (1 + 0.5 * (n - 1)) / n` split by `B.autoEngWeights`; with none, `total` goes to maintenance capacity. `state.ops.maintenanceCapacity` holds the week's capacity for S5.
- `projects` system: `progress += sum(week points) * (policies.comprehension_reviews ? B.comprehensionReviewSpeed : 1)`; stats accumulate raw points. Emit a `bubble` for up to 3 contributors per project per week showing their largest stat (`+N Features`, tone = stat). Complete at `progress >= pointsNeeded`.
- `trendMods = (TRENDS[trend].angleMods[angle] ?? 1) * (TRENDS[trend].categoryMods[category] ?? 1)`.
- `startProject` kind `new`: reasons for locked category, locked angle, unavailable or deprecated model, size above stage ("Needs a bigger office"), no cash, no available staff. Deducts `sizes[size].cost`. `pointsNeeded = sizes[size].points * (1 + B.pointsGrowthPerYear * yearIndex)`. `update` needs a live product (`sizes[product.size].points * B.updatePointsMult`); `migration` needs `migrationDueWeek !== null` (`B.migrationPoints`); `refactor` (`B.refactorPoints`); `craft` (`B.craftPoints`). Staff assignment is separate (UI or bots dispatch `assign`).
- `reviewScore`: `total = sum(stats)`; `E = sizes[size].points * (1 + B.expectationGrowth * yearIndex)`; `fit = comboFit * trendMods`; `imbalance` = count of features, polish, reliability with share below `B.balancePenaltyBelow`; `base = clamp(B.reviewScale * (total / E) * fit - 0.8 * imbalance, 1, 10)`; four outlet scores `clamp(base + range(-B.reviewNoise, B.reviewNoise), 1, 10)` rounded to 0.5 with a quote from the band (low below 5, high at 8+); `score` is their mean to 1 dp. Record `discoveredCombos[cat:angle] = fit` on first launch of a combo.
- Completion by kind: `new` creates a Product with `size`, `modelVersion = models[model].version`, `health = baseHealth = clamp(50 + 150 * reliabilityShare, 30, 100)`, `uptime 1`, `novelty = clamp(30 * noveltyShare * fit, 0, 10)`, `hype` = hype banked on the project by pre-launch campaigns (S6) else 0, `customers 0`, `mrr 0`, `copyAtWeek = week + int(B.copyDelayWeeks[0], B.copyDelayWeeks[1])`, `copied false`, `wrapperHit false`, `ownerId null`, `migrationDueWeek null`, `killed false`; emit `launch`, `celebrate`, a toast; contributors get `B.meaningLaunchBonus` meaning; `stats.launches++`. `update` merges stats 60/40 old/new, re-scores with fresh reviews, `version++`, `novelty = min(10, novelty + 3)`, `wrapperHit false`. `migration` sets `modelVersion` to current and clears `migrationDueWeek`. `refactor` lowers `comprehensionDebt` by `B.debtPaydownRefactor` and gives contributors +10 knowledge. `craft` gives contributors +15 meaning and brand +1. Contributors return to their default assignment.

**Tests:** `personPoints` rises with level and skill, burnout is far below ok, away is zero; `startProject` validation for each reason with state unchanged; two founders complete a small project in 6 to 20 weeks; a finished `new` project creates a product with score in [1, 10], four reviews, and a launch event; the same stats score lower in year 5 than year 0; zero reliability scores lower than balanced stats of equal total; automation adds points only when level > 0; with no projects, automation adds maintenance capacity instead.

- [ ] TDD cycle; commit `Add work output, projects, reviews, and launches`.

### Task S5: Live products and economy

**Files:** `src/sim/products.js`, `src/sim/economy.js`, `tests/sim/products.test.js`.

**Produces:** `productAppeal(state, product)`, `categoryShare(state, product) -> { mine, incumbent }`, `totalMrr(state)`, systems `products` (40) and `economy` (80), actions `killProduct`, `setOwner`, `upgradeOffice`.

Per live (not killed) product each week:
- `appeal = score^B.appealExp * comboFit * trendMods * (1 + brand/100) * (1 + novelty/20) * (0.7 + 0.3 * MODELS[model].trust) * uptime`, times `B.enterpriseComplianceMult` when the category is `compliance` and the model is not `complianceOk`.
- Competition: `incumbent = incumbentStrength * (1 + B.incumbentStrengthGrowth * yearIndex)`; `clones = categories[cat].clones * B.cloneStrength * (1 + 0.2 * yearIndex)`; `ownOthers` = sum of appeal of your other live products in the same category.
- `target = tam * appeal / (appeal + incumbent + clones + ownOthers)`.
- Acquisition, when `customers < target`: `customers += (target - customers) * (B.acquisitionRate + B.hypeAcquisition * hype + salesBoost) * (1 + brand/200)` where `salesBoost = B.salesCloseBoostPerPerson * min(salesStaffOnSales, 5) + B.autoSalesBoost * automation.sales.level`. Never above `tam`.
- Churn: `max(B.minChurn, B.baseChurn - B.churnBrandRelief * brand + (hype/10 > score + B.wrapperGap ? B.wrapperChurn : 0) + ops.supportShortfall * B.supportShortfallChurn + (outage on this product ? B.outageChurn : 0))`; `customers = floor(customers * (1 - churn))`, never negative.
- Support: `need = totalCustomers * B.supportHoursPerCustomer`; `have = sum(support staff on support: B.supportHoursPerPerson * outputMult) + automation.support.level * B.autoSupportHours`; `ops.supportShortfall = need > 0 ? clamp(1 - have/need, 0, 1) : 0`.
- Maintenance: `need = sum over live products (B.maintenancePerProduct + customers * B.maintenancePerCustomer)`; `ops.maintenanceShortfall = need > 0 ? clamp(1 - ops.maintenanceCapacity/need, 0, 1) : 0`. Each product: `health -= B.healthDecay * shortfall`; with no shortfall `health = min(baseHealth, health + B.healthRecovery)`; a missed migration (`migrationDueWeek !== null && week > migrationDueWeek`) costs `B.missedMigrationHealth` more; clamp 0..100. `uptime = B.uptimeFloor + (1 - B.uptimeFloor) * health / 100`, and 0 while this product has the active outage.
- `novelty = max(0, novelty - B.noveltyDecay)`; `mrr = customers * price`; `stats.peakMrr = max(peakMrr, totalMrr)`.

`economy` (80): revenue `totalMrr * 12 / 52`. Costs: salaries (away staff still paid); `OFFICE_STAGES[officeStage].rent`; per product `MODELS[model].productCost * models[model].costMult * customers * 12 / 52`; per automation function `autoCost * costMult * level` (x1.5 while `flags.gpuShortageWeeks > 0`); `B.gpuWeeklySelfHost` once if any product or function uses a self-hosted model; enabled policies' `weeklyCost`; `B.toolingWeekly` if tooling on. `cash += revenue - costs`. `lowCashWeeks` increments while `cash < 0`, resets to 0 otherwise; the first negative week emits a `warn` toast.

Actions: `killProduct` (live product required; marks `killed`, customers 0, mrr 0, owner and anyone who built it lose 10 meaning). `setOwner` (both exist; owner meaning bonus lives in S7). `upgradeOffice` ("Already at the biggest office", "Not enough cash"); deducts `upgradeCost`, `officeStage++`, emits `officeUpgrade` and a `good` toast.

**Tests:** appeal rises with score, brand, and novelty; target shrinks as clones rise; customers approach target and never exceed tam; wrapper gap raises churn; zero products and zero customers produce zero revenue, zero shortfalls, and finite state; economy subtracts salaries and rent; `lowCashWeeks` counts and resets; `upgradeOffice` fails without cash and succeeds with it; DeepSleep on Legal takes the compliance penalty and Claudius does not.

- [ ] TDD cycle; commit `Add live product market, support, maintenance, and economy`.

### Task S6: Marketing and brand

**Files:** `src/sim/marketing.js`, `tests/sim/marketing.test.js`.

**Produces:** action `runCampaign`; system `marketing` (45).

Rules:
- `runCampaign` validates: channel exists, `officeStage >= minStage`, cash, exactly one of a live `productId` or an active `new` project `projectId`. Deducts cost; pushes `{ id, channel, productId, projectId, weeksLeft: weeks }`.
- Weekly per campaign: `hypeGain = channel.hype * marketerMult * autoMult` where `marketerMult = min(2.5, 1 + 0.25 * sum over marketers on marketing of outputMult * mods.hype)` and `autoMult = 1 + B.autoMarketingHype * automation.marketing.level`. Product campaigns add to `product.hype`; project campaigns bank on `project.bankedHype`. `brand += channel.brand * (1 - B.autoMarketingBrandPenalty * automation.marketing.level)`. `weeksLeft--`; drop at 0.
- Marketers on `marketing` also add `B.marketerHypePerWeek * outputMult * mods.hype` to the newest live product that has no active campaign.
- Decay: every product `hype *= 1 - B.hypeDecay`; `brand -= B.brandDecay`; clamp hype and brand to 0..100.
- Wrapper hit: when a product first has `hype/10 > score + B.wrapperGap` and `!wrapperHit`: `brand -= B.wrapperBrandHit`, `wrapperHit = true`, `bad` toast "The Vergence calls <name> 'just a wrapper'".

**Tests:** campaigns deduct cash and expire after `weeks`; pre-launch project hype carries into the launched product; automated marketing adds hype but lowers brand gain; hype and brand decay and stay in range; the wrapper hit fires once; each validation failure leaves state unchanged.

- [ ] TDD cycle; commit `Add marketing campaigns, hype, and brand`.

### Task S7: Automation, oversight, meaning, moods, policies

**Files:** `src/sim/automation.js`, `src/sim/meaning.js`, `tests/sim/meaning.test.js`.

**Produces:** actions `setAutomation`, `setPolicy`; `automationExposure(state, person) -> 0..1` (max over fns of `ROLES[role].automatedBy[fn] * automation[fn].level`); `oversightRequired(state) = sum over fns of level * B.oversightHoursPerLevel[fn] * (1 - 0.6 * MODELS[model].guardrails)`; `oversightProvided(state) = sum over non-away staff on oversight of B.oversightHoursPerPerson * outputMult * mods.oversight`; both also written to `state.ops` weekly; system `meaning` (50).

Meaning per non-away person per week:
- `drain = exposure * B.meaningDrain[seniority] * mods.meaningDrain * (policies.pair ? B.pairMeaningDrainMult : 1)`, halved for seniors on `hardProblem` or `mentor` and for juniors who have a mentor.
- `recovery = (B.meaningBaseRecovery * (1 - exposure) + assignmentBonus + (policies.craft_fridays ? B.meaningRecovery.craftFridays : 0) + (owns a live product with score >= 6 ? B.meaningRecovery.owner : 0)) * mods.meaningRecovery`. `assignmentBonus`: mentor, hardProblem, oversight from `B.meaningRecovery`; a mentored junior gets `mentee`; staff on a `craft` project get `craft`.
- Away staff: `meaning += B.meaningRecovery.sabbatical`.
- Clamp 0..100. Mood: below `burnoutBelow` burnout, below `coastingBelow` coasting, else ok (away stays away). `burnoutWeeks` counts consecutive burnout weeks.
- Resignation (non-founders only): coasting `B.resignChance.coasting * mods.resign`; burnout with `burnoutWeeks >= B.burnoutWeeksBeforeResign` `B.resignChance.burnout * mods.resign`. On resign: emit `resign` and a farewell `chat`, call `onDeparture` (S8), remove the person, `stats.resignations++`.
- Chatter: up to 2 `chat` events per week from random staff: `CHATTER` key is `automated` when exposure > 0.5, `mentor` or `junior` when in a mentoring pair, `overseer` on oversight, else by mood (`happy` for ok). One `bubble` per week for a random coasting or burnout person (tone `bad`, short text like "sigh").
- `setAutomation`: fn in `FUNCTIONS`, level snapped to 0.25 steps in [0, 1], model available and not deprecated. `setPolicy`: policy exists; turning on requires `unlock(state)`; turning off always allowed.

**Tests:** exposure mapping (engineer at engineering 1.0 is 1.0, designer 0.35, support at engineering 1.0 is 0); a senior drains faster than a junior at equal exposure; pair cuts drain to 30%; mentoring halves drain and adds recovery; with zero automation, idle meaning trends upward; a seeded burnout run produces a non-founder resignation and never a founder resignation; oversight required rises with level and falls with guardrails; a locked policy cannot be turned on.

- [ ] TDD cycle; commit `Add automation dials, oversight, meaning, moods, and policies`.

### Task S8: Knowledge, institutional knowledge, comprehension debt

**Files:** `src/sim/knowledge.js`, `tests/sim/knowledge.test.js`.

**Produces:** `onDeparture(state, person)`, system `knowledge` (55).

Rules:
- Staff knowledge: `+B.knowledgeGainWorking` on project, maintenance, oversight, hardProblem, or security; mentored juniors `+B.knowledgeGainMentee`; engineers' working gain times `(1 - 0.7 * automation.engineering.level)` unless on hardProblem or mentor; cap 100.
- `institutionalKnowledge = clamp(100 * sum over engineers and security staff of (knowledge/100 * B.seniorityOutput[seniority]) / (B.ikBaseline + B.ikPerProduct * liveProducts), 0, 100)`.
- Debt weekly: `+ B.debtFromEngAuto * eng.level * (activeProjects > 0 ? 1 : 0.5) + B.debtFromQaAuto * qa.level + B.debtFromOpsAuto * ops.level + B.debtPerProduct * liveProducts + (ik < B.debtLowIkThreshold ? (B.debtLowIkThreshold - ik) * B.debtLowIkRate : 0) - B.debtPaydownPerSeniorEng * sum over senior engineers (not away) of knowledge/100 - (policies.comprehension_reviews ? B.debtPaydownReviews : 0)`; clamp 0..100.
- `onDeparture`: `comprehensionDebt = min(100, debt + person.knowledge * B.debtFromDeparturePerKnowledge)`; clear mentor assignments targeting the person; clear `ownerId` on their products.

**Tests:** IK drops when a high-knowledge senior leaves; debt rises under full engineering automation with no seniors, and falls with two knowledgeable senior engineers plus reviews; debt clamped to [0, 100]; finite with zero products and zero staff.

- [ ] TDD cycle; commit `Add knowledge, institutional knowledge, and comprehension debt`.

### Task S9: Vendors and market dynamics

**Files:** `src/sim/vendors.js`, `src/sim/market.js`, `tests/sim/market.test.js`.

**Produces:** systems `calendar-start` (10) and `market` (60); `categoryLeaders(state) -> [categoryId]`.

Rules:
- Year start (`week % 52 === 0`, including week 0 skipped since createGame already did it): unlock categories, angles, and models with `unlockYear`/`releaseYear <= year`; one `info` toast per unlock.
- Trend countdown; at 0 pick a different trend weighted uniformly, set its `weeks`, toast its `text`.
- Vendors: every `B.vendorReleaseEveryWeeks` weeks (not week 0) pick an available model: `version++`, `capability = min(100, capability + B.vendorCapabilityStep)`, `chat` from `@vendorbot`. With `B.deprecateChance` the old version is deprecated: every product on that model gets `migrationDueWeek = week + B.migrationDeadlineWeeks` and a `warn` toast. Independently with `B.priceHikeChance`: a random model's `costMult *= B.priceHikeMult` with a `warn` toast.
- Clones: for each category with one of your live products at score >= 6, `chance(B.cloneChanceBase * (1 + B.cloneChanceYearGrowth * yearIndex))` adds a clone and a `chat` from `@hackernewsbot` "Show HN: <Category> but with AI". Each existing clone disappears with chance `B.cloneDecay`.
- Incumbent copying: when `week >= copyAtWeek`, not `copied`, and `score >= 6`: `novelty *= B.copyNoveltyMult`, that category's `incumbentStrength *= B.copyIncumbentMult`, `copied = true`, toast "<Incumbent> announces <Angle> features. Sounds familiar."
- `categoryLeaders`: categories where your best live product's `customers / tam` exceeds the incumbent's implied share `incumbent / (appeal + incumbent + clones + ownOthers)`.

**Tests:** unlocks happen at the year boundary; trend rotates to a different trend; a vendor release with deprecation sets migration deadlines on affected products only; clone chance grows with year; copying halves novelty exactly once; leaders detection with a crafted state.

- [ ] TDD cycle; commit `Add vendor releases, trends, clones, and incumbent copying`.

### Task S10: Incidents, security, outages

**Files:** `src/sim/incidents.js`, `tests/sim/incidents.test.js`.

**Produces:** `securityPosture(state)`, system `incidents` (65), actions `buyAudit`, `setTooling`, `callConsultants`.

Rules:
- `posture = clamp(sum over non-away security staff of avg(skills) * B.postureSecurityPerSkill * outputMult / 10 + security.auditBoost + (tooling ? B.postureTooling : 0) - comprehensionDebt * B.postureDebtPenalty, 0, 100)`. `auditBoost` decays by `B.postureAuditDecay` per week. `buyAudit` costs `B.auditCost` and sets `auditBoost = B.postureAudit`. `setTooling` toggles.
- Rogue agents, per fn with level > 0: `risk = B.rogueBase * level * (1 - guardrails) * (B.rogueShortfallFloor + shortfall) * (1 + debt/50)` with `shortfall = required > 0 ? clamp(1 - provided/required, 0, 1) : 0`. Kind by fn: engineering `db_wipe` or `runaway_spend`; support `refund_hallucination`; sales `pricing_rewrite`; marketing `mass_email`; qa or ops `prompt_injection_leak`. Severity `int(1, 5)`, +1 if debt > 60 (max 5).
- Catch: `chance(min(B.catchMax, B.catchBase * coverage + max catch mod among overseers))`, `coverage = required > 0 ? min(1, provided/required) : 1`. Caught: damage times `B.caughtDamageMult`, no outage, each overseer gets `B.meaningCatchBonus`, emit `celebrate` for the best overseer and a `chat` from them. `stats.incidents++`; `stats.caught++` when caught.
- Cyber: `chance(min(B.cyberMax, B.cyberBase + B.cyberPerMrr * totalMrr))` of an attack; kind random among credential_stuffing, ransomware, supply_chain, data_exfiltration, phishing; it lands if `next(rng) * 100 > posture`, else a `good` toast "Security blocked a <kind> attempt". Landed attacks: `stats.breaches++`.
- Damage (both sources): `cash -= severity * B.incidentCashPerSeverity * (1 + B.incidentCashYearGrowth * yearIndex)`; `brand -= severity`; if uncaught, severity >= `B.outageMinSeverity`, no current outage, and a live product exists, start an outage on a random live product.
- Outage: `{ productId, kind, severity, weeks: 0, unrecoverable }` where `fixCapacity = sum over non-away engineers of knowledge/100 * B.seniorityOutput[seniority]` and `unrecoverable = fixCapacity < severity * (0.4 + debt/100)`. Weekly `weeks++`; re-evaluate `unrecoverable` (hiring or knowledge can make it recoverable); a recoverable outage clears once `weeks >= ceil(severity / max(fixCapacity, 0.1))` (minimum 1). `callConsultants` costs `B.consultantCost` and clears any outage. When an outage clears: with `blameless`, engineers +5 knowledge; without it, engineers -5 meaning.
- Every incident appends to `incidentLog` (trim to 30), emits `incident`, a `@pagerbot` chat, and one staff line from `CHATTER.incident`. Severity >= 4 and uncaught also calls `raiseDecision(state, <matching incident event id>, productId)` from S11.

**Tests:** posture rises with security staff and audit and falls with debt; rogue risk is zero at level 0 and higher on Grokk than Claudius; catch probability is higher with full coverage; an outage is unrecoverable with no knowledgeable engineers and high debt, and becomes recoverable after hiring knowledgeable engineers is simulated by raising knowledge; consultants clear an outage and cost cash; cyber chance grows with MRR and caps at `B.cyberMax`.

- [ ] TDD cycle; commit `Add rogue agents, cyber attacks, security posture, and outages`.

### Task S11: Events, decisions, annual calendar

**Files:** `src/sim/events.js`, `src/sim/calendar.js`, `src/data/events.js` (content written in S1, extended here if needed), `tests/sim/events.test.js`.

**Produces:** `raiseDecision(state, eventId, subjectId)`, `applyEffects(ctx, effects, subjectId)`, action `resolveDecision`, systems `events` (70) and `annual` (75).

Event schema:

```js
{
  id, kind /* staff | market | vendor | incident | cyber | annual | misc */,
  weight, cooldownWeeks, random /* false for events only raised by other systems */,
  when: (state) => boolean,
  subject: 'randomStaff' | 'seniorStaff' | 'juniorStaff' | 'burnoutStaff' | 'automatedSenior' | 'randomProduct' | null,
  title, text,                 // placeholders: {name}, {product}, {company}, {incumbent}
  choices: [{ label, hint, effects }],   // or
  auto: effects,
}
// effects keys (all optional):
// cash, brand, debt, ik, hype, customersPct (subject product), meaning, knowledge (subject staff),
// teamMeaning, resign (subject leaves), assign ({ type } for subject), candidates ('juniorBatch' | 'seniorBatch'),
// flag ({ name, value }), win ('acquired'), salaryPct (subject), startCraft (true), gpuShortageWeeks
```

`events` system: with `chance(B.randomEventChance)` pick among `random` events whose `when` holds, whose subject resolves, and whose cooldown has passed (`flags['cd_' + id]`), weighted by `weight`. `auto` events apply and toast. Choice events set `pendingDecision` (text with placeholders filled) and emit `decision`. `resolveDecision` validates the index, applies that choice's effects, clears `pendingDecision`, and emits a toast summarizing the outcome.

`annual` system: week-of-year 40: `conference_expo` decision (skip booth / small booth -15000 brand +2 hype +10 on newest product / big booth -40000 brand +5 hype +25, big needs stage 1). Week-of-year 50: `awards_show`: best live product with score >= 8 wins Product of the Year (brand +6, `B.meaningAwardBonus` to engineers and designers, `award` event, `stats.awards++`); if there was an unrecoverable outage this year, a joke `award` for Worst Outage. Week-of-year 52: `year_summary` toast with MRR, customers, and headcount.

Events (46; each with real title, text, choices with hints, and effects in the game's warm, funny voice):
- Staff (14): `senior_grumble` (automatedSenior: "Is my job just reviewing robot PRs now?"; give a hard problem [assign hardProblem, meaning +6] / talk it through [meaning +8, cash -500] / ignore [meaning -6]), `junior_asks_mentor` (juniorStaff; pair them [assign mentor on a senior, handled by applying `assign` to the best available senior] / not now [meaning -4]), `resignation_letter` (burnoutStaff; counter-offer [salaryPct +15, meaning +20] / suggest sabbatical if policy on [assign sabbatical] / accept [resign]), `burnout_warning` (auto, toast), `poached_by_bigco` (seniorStaff; match [salaryPct +20] / let go [resign]), `junior_first_feature` (auto, juniorStaff meaning +10, teamMeaning +1), `senior_side_project` (seniorStaff; greenlight craft [startCraft] / not now [meaning -3]), `hackathon` (cash -3000, teamMeaning +6, debt +2 / skip), `team_offsite` (cash -12000, teamMeaning +10 / skip), `bootcamp_grads` (auto candidates juniorBatch), `industry_layoffs` (auto candidates seniorBatch, teamMeaning -3), `remote_debate` (hybrid [teamMeaning +2] / office mandate [teamMeaning -5, ik +2]), `ai_skeptic_speech` (seniorStaff; listen [meaning +6, flag] / wave it off [meaning -4]), `mentor_pride` (auto, meaning +8 on a mentor).
- Market (10): `incumbent_copies_flavor`, `clone_wave`, `enterprise_rfp` (needs a compliant model on a live product for the good outcome: customersPct +15, brand +2; otherwise lose it), `big_customer_threat` (discount [cash -8000] / call their bluff [customersPct -8 on 50%]), `press_wrapper_mockery`, `viral_post` (auto hype +20), `acquisition_offer` (once, eligible at `totalMrr >= B.acquisitionOfferMrr`: accept [win acquired] / decline [brand +2]), `vc_offer` (take it [cash +500000, flag diluted] / bootstrap on), `product_hunt_top` (auto hype +15, brand +2), `analyst_report` (auto brand +3 when best score >= 7, else -2).
- Vendors (6): `vendor_new_version`, `vendor_price_hike`, `vendor_outage` (auto: products on a random model lose 20 health), `grokk_pr_scandal` (only if Grokk is in use; brand -4, or switch now which starts migrations), `open_weights_release`, `gpu_shortage` (auto gpuShortageWeeks 8).
- Incidents (6, `random: false`, raised by S10): `agent_db_wipe`, `agent_runaway_spend`, `agent_mass_email`, `agent_prompt_injection_leak`, `agent_pricing_rewrite`, `support_refund_hallucination`. Choices: roll back and eat the cost [cash], blame the vendor [brand -3 unless model is Claudius or ChatGBT], public postmortem [brand +3 with blameless, else brand -1, ik +3].
- Cyber (5, `random: false`): `credential_stuffing`, `ransomware` (pay [cash -60000] / restore from backups [needs ik >= 40, else customersPct -20]), `supply_chain`, `data_exfiltration`, `phishing_ceo`.
- Annual (3, `random: false`): `conference_expo`, `awards_show`, `year_summary`.
- Misc (2): `coffee_machine_broke` (buy the fancy one [cash -2500, teamMeaning +3] / live with it [teamMeaning -2]), `office_dog` (auto teamMeaning +4).

**Tests:** eligibility respects `when`, subject availability, and cooldown; a choice event blocks `tick` until resolved; `resolveDecision` applies exactly the chosen effects; accepting `acquisition_offer` ends the game as a win once S12 lands (write the test now against `state.gameOver` being set by `win`); every effects object uses only known keys; 300 weeks with a fixed seed produce at least 10 distinct events.

- [ ] TDD cycle; commit `Add random events, decisions, and annual calendar`.

### Task S12: Endgame, score, epilogue, save

**Files:** `src/sim/endgame.js`, `src/data/epilogues.js`, `src/save/save.js`, `tests/sim/endgame.test.js`, `tests/sim/save.test.js`.

**Produces:** systems `endgame` (90) and `history` (95); action `ipo`; `scoreRun(state)`; `endGame(state, { won, reason })`; `saveGame(state, storage)`, `loadGame(storage) -> { ok, state, reason }`, `hasSave(storage)`, `clearSave(storage)` where `storage` defaults to `globalThis.localStorage` and tests pass a Map-backed fake with `getItem`/`setItem`/`removeItem`.

Rules:
- Lose `runway`: `lowCashWeeks >= B.runwayLoseWeeks`. Lose `collapse`: an unrecoverable outage with `weeks >= B.outageCollapseWeeks` on a product holding at least `B.collapseMrrShare` of MRR, or no non-founder staff while `institutionalKnowledge < 10` and an outage is active.
- Win: `ipo` action valid when `totalMrr >= B.ipoMrr && brand >= B.ipoBrand && officeStage === 2` (else reasons); acquisition via the event's `win` effect; at `week >= B.runWeeks - 1`, win `leader` if `categoryLeaders(state).length >= B.leaderCategoriesToWin`, else end with `timeout` (not a win).
- `scoreRun`: `valuation = totalMrr * 12 * (4 + 8 * brand/100) + max(0, cash)`; `wellbeing = avg meaning * staff count`; `raw = valuation/10000 + brand*50 + wellbeing*2 + stats.caught*100 - stats.breaches*200 - stats.resignations*50`; `score = round(max(0, raw) * (won ? 1 : 0.5) * (flags.diluted ? 0.8 : 1))`. Returns `{ score, valuation, breakdown }`.
- `endGame` sets `gameOver = { won, reason, score, epilogue }` and emits `gameOver`.
- `EPILOGUES` (20+ entries `{ id, when(state, summary), text }`, summary = `{ won, reason, avgMeaning, juniorsHired, caught, breaches, debt, resignations, seniors, peakMrr }`): pick every matching entry, then cap at 5 and ensure at least 3 by adding generic ones. Examples: "Acquired by Salesfarce. Your seniors left within the year. The product was sunset in 18 months." / "Three of your former juniors now run teams of their own." / "Nobody remembers who wrote the billing service. It still works. Nobody touches it." / "Your agents still run the support desk. Customers say it is fine. Nobody asks what fine means."
- `history` appends `{ week, cash, mrr, customers, brand, debt, ik, juniors, mids, seniors, avgMeaning, incidents }` weekly, trimmed to `B.maxHistory`.
- Save key `hitl.save.v1`. `loadGame` reasons: "No save found", "Save is corrupted" (parse error or missing required keys), "Save is from an incompatible version" (`version !== SAVE_VERSION`).

**Tests:** runway loss after exactly 8 negative weeks; IPO rejected below each threshold, accepted above; `timeout` versus `leader` at run end; score finite and higher for a win than the same state lost; epilogue returns 3 to 5 lines; save round trip equality; corrupt JSON, wrong version, and missing save each return the right reason.

- [ ] TDD cycle; commit `Add endgame, scoring, epilogues, and save/load`.

### Task S13: Bots, invariants, balance harness, tuning

**Files:** `src/sim/bots.js`, `scripts/balance.js`, `tests/sim/invariants.test.js`, `tests/sim/balance.test.js`, tuning in `src/sim/balance.js`.

**Produces:** `BOTS = { automateAll, allHumans, balanced }`, each `(state) -> action[]` called once per week before `tick` (resolving any `pendingDecision` first); `runBot(name, seed, maxWeeks = B.runWeeks) -> { won, reason, weeks, peakMrr, score }`; `assertFinite(state)` which throws with the path of any non-finite number.

Bot behavior:
- `automateAll`: every dial at 1.0 on the cheapest available model; never hires juniors; hires seniors only when cash exceeds 20 weeks of burn; keeps a medium `new` project going on the best-known combo, assigning all engineers and designers; runs a launch campaign per launch; no oversight, mentoring, security, or policies; picks the cheapest decision choice.
- `allHumans`: every dial 0; hires to capacity with any seniority when cash exceeds 12 weeks of burn; always has a project; pairs mentors; content campaign only; upgrades the office when it can afford 1.5x the cost.
- `balanced`: engineering 0.5, support 0.5, others 0.25 on ChatGBT, Claudius when affordable; policies `pair`, then `comprehension_reviews`, `apprenticeship`, `sabbatical` as they unlock; one overseer per 20 required oversight hours; hires a junior for each senior and pairs mentors; one security hire by stage 1; launch plus content campaign each launch; coasting seniors to hardProblem, burnout staff to sabbatical when possible; upgrades office at a 1.5x cash cushion; updates when novelty < 3, migrations when due, refactor when debt > 40; consultants when an outage is unrecoverable; IPO when eligible; declines acquisition before year 8 and accepts after if MRR has been flat for 26 weeks.

**Tests:**
- `invariants.test.js`: each bot, seeds 1 to 5, full run, `assertFinite(state)` after every tick; staff count never exceeds capacity; `history.length <= B.maxHistory`.
- `balance.test.js` (timeout 180 s): 40 seeds per bot: `automateAll` loses in at least 70%; `allHumans` fails to win in at least 70%; `balanced` wins in 30% to 90%; at least one balanced run reaches `officeStage === 2`.
- `scripts/balance.js --seeds N` (default 100): table per bot with win %, loss-reason histogram, median weeks, median peak MRR, median score.

- [ ] Write bots and tests; run `npm run balance`; tune only `balance.js` (and bot logic when a bot is plainly misplaying) until thresholds pass. Load the `balance-tuning` skill for the lever order. Put the final table in the commit message.
- [ ] Commit `Add strategy bots, invariants, and balance harness; tune constants`.

---

## Lane A: Render and art (art-director)

Load the `art-direction` and `blender-pipeline` skills. Develop against `?mock=<scenario>`. Verify every task with `npm run snap` for the listed scenarios and look at the PNGs (Read them) against the art bar before committing. The renderer knows state only through the Contract.

**Render API (built up across A1 to A6):**

```js
// src/render/index.js
createRenderer({ canvas, labelsEl, quality }) -> {
  sync(state),                   // every frame; diffs state into the scene (staff, stage, racks, outage)
  handleEvents(events, state),   // bubbles, speech, confetti, alarms, shake, hires, resignations, stage transition
  setTimeOfDay(t),               // 0 = midnight, 0.5 = noon
  setQuality(q),                 // 'low' | 'medium' | 'high'
  setTiltShift(on),
  pick(clientX, clientY) -> { kind: 'staff' | 'rack' | null, id },
  focusStaff(id),
  resize(), render(dt), dispose(),
}
```

### Task A1: Renderer, camera, lighting, post-processing

**Files:** `src/render/index.js`, `src/render/scene.js`, `src/render/camera.js`, `src/render/post.js`, `src/render/lighting.js`.

- Orthographic camera at true isometric angles (yaw 45 degrees, pitch about 35.26 degrees). Pan by drag and WASD or arrows, zoom by wheel (clamped), rotate in 90 degree steps with Q and E (smooth tween). Pan bounds follow the office size.
- `WebGLRenderer`: ACES filmic tone mapping, sRGB output, PCFSoft shadows. Key directional light with a shadow camera fitted to the office, hemisphere fill, warm interior lights that come on at night.
- Post chain (`EffectComposer`): `RenderPass`, `GTAOPass` (high), `UnrealBloomPass` with a high threshold so only emissive screens and LEDs bloom (medium, high), tilt-shift via `HorizontalTiltShiftShader` plus `VerticalTiltShiftShader` (focus band at screen center, toggleable), `OutputPass`, `SMAAPass` (high).
- `setTimeOfDay` lerps background gradient, sun color, intensity, and angle, window emissive, and interior lights.
- Resize updates renderer, composer, every pass, and the CSS2D label renderer.
- **Verify:** `npm run snap -- --scenario garage` at 1920x1080 and 1024x640, plus `--time night`; clean images, zero console errors.
- [ ] Commit `Add renderer, isometric camera, lighting, and post-processing`.

### Task A2: Palette, materials, primitives

**Files:** `src/render/palette.js`, `src/render/materials.js`, `src/render/prims.js`.

- `palette.js`: one cohesive named set: warm woods, cream walls, soft floors, concrete, glass, plant greens, the six role accents from `ROLES`, screen glows, LED green/amber/red, alarm red.
- `materials.js`: cached shared materials (`MeshStandardMaterial`, metalness near 0, roughness 0.55 to 0.9) with an optional toon gradient ramp; emissive screen and LED materials; `paletteMaterial(name)` resolves glTF material names of the form `pal_<name>` so Blender assets pick up palette materials at load.
- `prims.js`: `roundedBox(w, h, d, r, seg)` (RoundedBoxGeometry), `roundedCylinder`, `pill`, lathe helpers, and static-batch merging.
- **Verify:** `?mock=garage&kit=1` shows a material swatch board; snap it.
- [ ] Commit `Add palette, shared materials, and procedural primitives`.

### Task A3: Blender pipeline and hero props

**Files:** `blender/lib/common.py`, `blender/props/*.py` (one script per prop), `scripts/build-models.sh`, `public/models/*.glb`, `src/render/models.js`.

- `common.py`: factory reset, bevel plus weighted-normal helper, palette material assignment by name, glTF export helper (`export_apply=True`, Y-up).
- `build-models.sh`: runs every script headless (`blender -b --factory-startup -P <script> -- --out public/models/<name>.glb`), stops on the first failure, prints triangle counts. Idempotent. Commit the `.glb` outputs so the game runs without Blender.
- Props (bevelled; under 3k triangles each; origin at floor center; 1 unit = 1 meter): `desk` (cable tray), `chair` (five-star base), `monitor` (screen as material `pal_screen` so the renderer swaps in canvas textures), `laptop`, `server_rack` (LED slots as `pal_led`), `plant_tall`, `plant_small`, `coffee_machine`, `whiteboard`, `couch`, `bookshelf`, `garage_door`, `window_frame`, `monitoring_wall` (big screen slot), `water_cooler`, `trophy`.
- `models.js`: GLTFLoader cache, `loadModels()` promise, `getModel(name)` clone with palette remap and shadows on.
- **Verify:** `npm run models` succeeds; `?mock=floor&props=1` lineup snapped and reviewed against the art bar.
- [ ] Commit `Add Blender prop pipeline and hero props`.

### Task A4: Chibi characters

**Files:** `blender/characters/chibi.py`, `public/models/chibi.glb`, `src/render/character.js`.

- Blender exports named part meshes: head, eyes, hair variants 0 to 7, torso per build 0 to 2, upper arm, hand, leg, shoe, accessories (glasses, headphones, beanie, cap), and a lanyard strip that takes the role color.
- Proportions: head about 45% of height. Silhouettes and hair variants read clearly at gameplay zoom.
- `createCharacter(appearance, roleColor) -> { root, setAnim(name), update(dt), setEmote(kind | null), setTint(gray0to1) }`. Parts assembled into a hierarchy; skin tone from 6 swatches, hair color, shirt and pants from appearance.
- Procedural animations (transform-based, no skeleton): `idle` (breathing bob, blinks), `typing`, `walk`, `run`, `slumped` (head down, slow typing, slight gray tint), `burnout` (head on desk, occasional sigh), `celebrate` (jump, arms up), `sip` (coffee), `wave`.
- Emotes above the head: sweat drop, sparkle, storm cloud, lightbulb, heart, zzz, exclamation.
- **Verify:** `?mock=floor&chars=1` lineup of every hair, build, accessory, and skin variant, with a row per animation; snap and review.
- [ ] Commit `Add chibi characters and procedural animation`.

### Task A5: Office stages

**Files:** `src/render/office.js`, `src/render/layout.js`, `src/render/screens.js`.

- `layout.js`: for each stage, desk slots (garage 4, floor 12, HQ 30), zones (meeting room, monitoring corner, lounge, coffee, whiteboard, racks, door), and a small waypoint graph for walking.
- `office.js`: each stage is a cutaway diorama: a floor slab with visible thickness and edge trim, two back walls with windows, no front walls. Garage: concrete, garage door, shelves, one rack, folding-table energy. Office Floor: carpet tiles, glass meeting room, lounge couch, coffee machine, two racks, whiteboard wall. HQ: two-tone floor, several zones, monitoring wall, trophy shelf, four racks, big windows with a city silhouette. Stage transition: old stage sinks and fades, new stage rises with a dust puff.
- `screens.js`: pooled canvas textures for monitors (scrolling code, UI mockups, charts) refreshed at 4 Hz; red tint during an outage; gray for coasting or burnout staff. The monitoring wall shows agent activity bars by automation level and flashes red on rogue incidents.
- **Verify:** snaps of `garage`, `floor`, `hq`, each at day and night, 1920x1080.
- [ ] Commit `Add three office stages with layout, screens, and transitions`.

### Task A6: State sync and effects

**Files:** `src/render/sync.js`, `src/render/fx.js`, `src/render/labels.js`.

- `sync(state)`: characters keyed by staff id (created, reused, removed). Placement by assignment: project and maintenance at desks, oversight at the monitoring wall or racks, mentor pairs at adjacent desks, hardProblem at the whiteboard, away hidden with a "on sabbatical" sign on their desk. Animation from mood and assignment; idle staff wander to the coffee machine sometimes. Rack LEDs blink faster with more products and pulse red during an outage.
- `handleEvents`: `bubble` is a rising "+N Stat" label colored by tone with a squash-and-stretch pop; `chat` from a staff member is a speech bubble for 3 s; `launch`, `award`, `celebrate` fire confetti and cheering; `incident` sweeps a red alarm light, shakes the screen for 400 ms, and makes nearby staff run; `resign` waves, walks out with a box, and fades; `hire` walks in from the door; `officeUpgrade` runs the stage transition.
- Bounded: at most 40 live labels and 6 confetti systems, oldest removed first; labels and particles pooled.
- Picking: raycast staff and racks; `focusStaff` eases the camera.
- **Verify:** `npm run snap -- --scenario floor --speed 4 --wait 180000` reports a stable label count and zero console errors; snap `incident` mid-alarm.
- [ ] Commit `Sync scene to game state and add effects`.

### Task A7: Art quality pass

- Snap garage day, floor day, floor night, HQ day, HQ night, incident, a launch confetti moment, and a close zoom on characters. Critique each against the `art-direction` checklist, list the five biggest weaknesses, fix them, re-snap. Repeat until the reviewer signs off.
- Performance: report average frame time over 10 s for `hq` at 1080p High from a real GPU run in Chrome (the reviewer or lead runs it; headless swiftshader numbers do not count).
- [ ] Commit `Art quality pass`.

---

## Lane U: UI and audio (ui-engineer)

Develop against `createMockSim` via `?mock=`. Verify with `npm run snap` and DOM checks. Style: chunky rounded panels, thick outlines, soft drop shadows, Fredoka for UI and JetBrains Mono for numbers, cream panels with role-color accents; panel backgrounds are opaque so text reads over the scene.

**UI API:**

```js
// src/ui/index.js
createUI({ root, getState, dispatch, controls }) -> {
  update(state),               // cheap per-frame refresh of HUD and the open panel
  handleEvents(events, state), // toasts, chat feed, decision popup, launch results, game over
  showTitle(), hideTitle(),
  openStaff(id),               // used when a character is clicked in the scene
}
// controls: { setSpeed(0|1|2|4), getSpeed(), newGame({ companyName, seed }), continueGame(), loadStatus(), save(),
//             setQuality(q), setTiltShift(on), setVolume(v), focusStaff(id) }
```

### Task U1: UI kit, HUD, feeds

**Files:** `src/ui/index.js`, `src/ui/dom.js` (`h(tag, props, ...children)`, `mount`, `clear`, `fmtMoney`, `fmtNum`, `fmtPct`), `src/ui/style.css`, `src/ui/hud.js`, `src/ui/toasts.js`, `src/ui/chat.js`, `src/ui/menu.js`.

- Top bar: company name; date (week, quarter, year); cash (red and pulsing when negative, with runway weeks left); MRR with trend arrow; brand, IK, and debt meters; speed buttons (Space pauses, 1/2/3 set speed).
- Bottom menu: Build, Staff, Marketing, Models, Automation, Ops, Office, Reports, with keyboard hints; one panel open at a time; Esc closes.
- Toasts top-right, at most 5 visible, 4 s (warn and bad 7 s).
- Chat feed (#general) bottom-left, collapsible, keeps the last 50 lines in the DOM.
- Down to 1024x640, panels scroll instead of overflowing.
- **Verify:** snap `floor` and `hq` at 1920x1080 and 1024x640; zero console errors.
- [ ] Commit `Add UI kit, HUD, menu, toasts, and chat feed`.

### Task U2: Build, Staff, Hiring

**Files:** `src/ui/panels/build.js`, `src/ui/panels/staff.js`, `src/ui/panels/hire.js`, `src/ui/widgets.js` (meters, 2D canvas portraits drawn from `appearance`, chips, buttons).

- Build: name field with a Suggest button (silly generated names); category grid (locked ones grayed with the unlock year); angle grid; discovered combo fit shown as stars; model cards (cost, capability, guardrails, trust, compliance badge); size; cost summary; team picker (role, level, mood); Start dispatches `startProject` then `assign` for each picked person. Project list with progress bars, plus Update, Migrate, Refactor, and Craft actions.
- Staff: sortable table (name, role, seniority, level, meaning bar colored by mood, knowledge, assignment dropdown, trait chips). Detail drawer: portrait, stats, traits with descriptions, meaning sparkline from history, actions (mentor picker for juniors, hard problem, oversight, sabbatical, train, fire).
- Hire: candidate cards (portrait, role, seniority, salary, skill bars, traits); Hire is disabled with the reason when unaffordable or full.
- Every failed `dispatch` shows its `reason` as a warn toast.
- [ ] Commit `Add build, staff, and hiring panels`.

### Task U3: Marketing, Models, Automation and Policies

**Files:** `src/ui/panels/marketing.js`, `src/ui/panels/models.js`, `src/ui/panels/automation.js`.

- Marketing: product or pre-launch project selector, channel cards (cost, duration, hype, brand, stage lock), active campaigns with weeks left, brand and hype meters, a wrapper-risk warning when hype outpaces score.
- Models: vendor cards in each model's color with blurb, version, capability, cost, guardrails, trust, compliance, and what uses it; migration-due warnings with a Migrate button.
- Automation: a row per function with a 0/25/50/75/100% control, model select, and live readouts (output gain, weekly cost, oversight required versus provided in red when short, affected staff and their average meaning). Policies list with toggles, lock reasons, costs, and descriptions.
- [ ] Commit `Add marketing, models, and automation panels`.

### Task U4: Ops, Office, Reports

**Files:** `src/ui/panels/ops.js`, `src/ui/panels/office.js`, `src/ui/panels/reports.js`, `src/ui/charts.js` (small canvas line, area, and stacked charts).

- Ops: security posture with breakdown, audit button, tooling toggle, current outage card (severity, weeks, "Nobody here can debug this" when unrecoverable) with Call Consultants, incident log, oversight coverage.
- Office: current stage, capacity, rent, and the upgrade card.
- Reports: MRR, customers, and cash over time; staff pipeline stacked chart (juniors, mids, seniors); debt and IK trend; product cards (score, reviews, customers, MRR, health, novelty, owner selector, Update and Kill); discovered combos table.
- [ ] Commit `Add ops, office, and reports panels`.

### Task U5: Popups and meta screens

**Files:** `src/ui/popups.js`, `src/ui/title.js`, `src/ui/settings.js`, `src/ui/gameover.js`, `src/ui/tutorial.js`.

- Decision popup: modal while `pendingDecision` is set; title, text, choices with hints; keys 1 to 4.
- Launch results: four outlet reviews revealed one at a time with scores and quotes, then the final score.
- Title screen: "Human in the Loop" lockup over the live diorama; New Game (company name, optional seed); Continue (disabled with the `loadStatus()` reason when unavailable); Settings.
- Settings: volume, quality, tilt-shift, default speed.
- Game over: headline, reason, score breakdown, epilogue lines revealed one at a time, New Game.
- Tutorial: five dismissible first-run coach marks (HUD, Build, Staff, Automation, speed), remembered in localStorage `hitl.tutorialDone` (wrapped in try/catch).
- [ ] Commit `Add decisions, launch results, title, settings, game over, and tutorial`.

### Task U6: Audio

**Files:** `src/audio/audio.js`.

- `createAudio() -> { unlock(), play(name), setVolume(v), setMusic(on), onEvents(events) }`. Procedural WebAudio sounds: click, panel open and close, coin, typing ambience scaled by working staff, launch fanfare, award, alarm, resign, hire, notification blip. A gentle generated lo-fi loop. Nothing plays before the first user gesture.
- [ ] Commit `Add procedural audio`.

---

## Lane L: Integration (lead)

### Task L1: Main loop and wiring

**Files:** `src/main.js`.

- Boot: the title screen over a live `garage` scene. New Game creates a game; Continue loads via `loadGame`.
- Loop (`requestAnimationFrame`): at speed `k`, one sim week every `2.0 / k` seconds; at most one tick per frame; accumulated time is dropped when the tab is hidden. Events from `tick` and `dispatch` go to the renderer, UI, and audio. Autosave every 4 weeks and on `beforeunload`.
- Time of day: one in-game day every 4 real seconds at 1x, visual only.
- `?mock=` keeps working for the snap tool; `?seed=` gives reproducible games; `window.__HITL = { state, dispatch, setSpeed, tickN(n) }` in dev builds; `window.__HITL_READY` after the first rendered frame. Scene clicks on staff call `ui.openStaff(id)`.
- **Verify:** `npm run build` succeeds; `npm run snap -- --real --seed 1 --weeks 20` (add `--real` and `--weeks` to the snap tool, fast-forwarding through `__HITL.tickN`) produces a PNG of a real game with zero console errors.
- [ ] Commit `Wire sim, renderer, UI, and audio into the game loop`.

### Task L2: Playtest and polish

- Reviewer and lead play the real game in Chrome: a full run at 4x using the balanced approach and one using automate-everything, screenshots at key moments, console clean. Findings go to the owning lane as tasks; fix; re-run.
- Final evidence: `npm test` all green, `npm run balance` meets thresholds, `npm run build` clean, art bar screenshots reviewed, playtest at 1920x1080 and 1024x640.
- [ ] Merge the lanes into `feat/one-shot`; report the evidence (test output, balance table, screenshots) to the user.

---

## Dependencies

```
P0 -> L0 -> S1 .. S13  (sim lane, serial)
         -> A1 .. A7  (art lane, serial; needs only the contract and mock)
         -> U1 .. U6  (ui lane, serial; needs only the contract and mock)
S2 + A1 + U1 -> L1 (wiring starts early and grows as lanes merge)
everything -> L2
```

The lead merges each lane task after the reviewer passes it, keeps `feat/one-shot` green, and rebases lane branches when the contract changes.

---

## Phase 2 additions: Progression and Slackk

Approved by the user after the lanes started. Specs: the spec's **Progression** and **Slackk (team chat)** sections. The canonical contract is `src/contract/contract.md` (it now includes `items`, `research`, staff `path`/`pathPending`/`legend`/`record`, project kind `research`, the extended `chat` event, and the `train`/`choosePath`/`buyItem`/`upgradeItem`/`sellItem` actions); the contract copy earlier in this plan is historical. Order: sim does S12b and S12c after S12 and before S13, so balance tunes everything together. ui does U7 and U8 after U6. art folds item props into A3 and item placement into A5 and A6.

### Task S12b: Progression (sim)

**Files:** `src/data/items.js`, `src/data/research.js`, `src/data/paths.js`, `src/data/training.js`, `src/sim/progression.js`, updates to `staff.js`, `work.js`, `meaning.js`, `knowledge.js`, `incidents.js`, `products.js`, `state.js`, `balance.js`; tests `tests/sim/progression.test.js`.

- `OFFICE_STAGES` gains `itemSlots`: 3, 8, 16.
- `ITEMS` keyed by id: `{ id, name, desc, minStage, costs: [l1, l2, l3], effects: [e1, e2, e3], requires }`. Values exactly as the spec's Office shop table; costs start around $3k (Garage-affordable) and roughly triple per level; Trophy Case requires `stats.awards >= 1`. `buyItem` (reasons: "No free item slots", "Needs a bigger office", "Not enough cash", "Needs an award first"), `upgradeItem` ("Already max level", "Not enough cash"), `sellItem` (refunds half of total spent). Effects are read through one helper, `itemBonus(state, key)`, summing active levels, so systems never switch on item ids.
- `RESEARCH` keyed by id: `{ id, name, desc, points, requires, effect }`, effects exactly as the spec's Internal tools table, points 300 to 800. `startProject` kind `research` validates prerequisites and not-already-done ("Already researched", "Requires <name>"); completion appends to `research.done` with a toast and a `#wins` chat line. `researchBonus(state, key)` helper.
- `PATHS` keyed by id with `role` and `mods` (same mod vocabulary as traits, plus path-specific keys such as `debtPaydown`, `menteeXp`, `outageFix`, `brandPerWeek`, `supportHours`). Promotion to senior sets `pathPending: true` and emits a toast ("<name> is ready to choose a career path"). `choosePath` validates role match and `pathPending`. `staffMods(person)` merges traits plus path mods (Legend multiplies the path's deviation from 1 by 1.25).
- Level 20 sets `legend: true` (toast, `celebrate`, `#wins` line).
- `record` counters increment weekly (mentor, hardProblem) and on catches; thresholds award earned traits (max 3 traits), with a toast.
- `TRAINING` programs `workshop`, `conference`, `course` with cost, xp, effects, and away weeks as in the spec. `train` gains `program` and `focus` (reasons: "Unknown program", "Pick a skill to focus", "They are away").
- **Tests:** each item effect changes its system by the table amount at each level; slot limits per stage; sell refunds half; research prerequisites; each research effect applies; path mods apply and Legend boosts them; pathPending set on promotion and cleared by choosePath; earned traits at thresholds and cap at 3; training programs cost and effects; everything JSON-safe and finite.
- [ ] TDD cycle; commit `Add office items, internal tools research, career paths, and training programs`.

### Task S12c: Slackk chat content (sim)

**Files:** `src/data/chatter.js` (extended), `src/data/threads.js`, `src/sim/chat.js` (replaces the chatter emission in `meaning.js`), tests `tests/sim/chat.test.js`.

- Every `chat` event uses the contract shape: `id` from `newId(state, 'm')`, `channel`, `from`, `fromId`, `text`, `replyTo`, `reactions`.
- **Templates** with placeholders `{product}`, `{coworker}`, `{model}`, `{incumbent}`, `{category}`, filled from real state; skip a template whose placeholder cannot be filled.
- **Threads** (`THREADS`, 30+): `{ id, when(state, h), channel, post: { who, text }, replies: [{ who, text }] }` where `who` selects a role or relation (`poster`, `coasting senior`, `their mentee`, `any junior`, `founder`, `random`). Examples: a coasting senior posts and a junior they mentored replies; an agent incident and the overseer who caught it; a launch and a designer's pride; a price hike and a sales rep's panic.
- **Channels:** mood chatter to `general`; incidents, outages, pagerbot, and breach lines to `incidents`; launches, promotions, awards, Legends, research done to `wins`; office, coffee, dog, and item purchases to `random`.
- **Reactions:** count and variety scale with average meaning; wins get celebration emoji; incidents get 💀 and 👀; farewells get 🫡.
- **Volume:** chat lines per week `= round(B.chatBase + B.chatPerMeaning * avgMeaning)`, so a burnt-out team goes quiet. Cap 6 per week.
- **Tests:** placeholders always filled (no `{` left in text); replies reference an existing id; channel routing per source; reaction totals higher at high meaning than low; volume falls with meaning; deterministic.
- [ ] TDD cycle; commit `Add Slackk chat: channels, contextual templates, threads, reactions`.

### Task U7: Progression UI (ui)

**Files:** `src/ui/panels/office.js` (becomes the Office Shop), `src/ui/panels/research.js` (a tab in Build or its own panel), `src/ui/panels/staff.js` (career path picker and training programs), `src/ui/widgets.js`.

- Office Shop: stage and slot usage ("5/8 slots"), item cards with level pips, current and next-level effect in plain words, Buy / Upgrade / Sell with disabled reasons; the office upgrade card stays here.
- Research: a small tree (cards with prerequisite arrows or indentation), done / available / locked states, points and a Start button that creates a research project and opens its team picker.
- Career path picker: a modal that opens from the staff detail (and from the "ready to choose a career path" toast) showing the role's paths with perks; a badge on staff rows with `pathPending`; path name and Legend badge shown in the staff table and detail.
- Training: program picker (Workshop needs a skill focus) with cost, effects, and away time.
- [ ] Commit `Add office shop, research, career paths, and training UI`.

### Task U8: Slackk panel (ui)

**Files:** `src/ui/chat.js` (rewrite), `src/ui/style.css`.

- Branded Slackk panel (bottom-left, collapsible): channel list with unread badges; messages with avatar (from portrait widget), name, week, text; replies indented under their parent with a thread line; reaction pills; bot messages styled differently.
- Clicking a name calls `controls.focusStaff(id)` and `openStaff(id)`.
- Bounded: last 60 messages per channel in memory and DOM.
- A healthy team's feed looks busy and colorful; a quiet feed is visibly quiet (show "It's been quiet in #general for a while" after 6 silent weeks).
- [ ] Commit `Add Slackk team chat panel`.

### Art additions (art)

- A3: item props with three visible tiers (espresso, plant_wall, nap_pod, arcade, standing_desk, trophy_case, server_rack, library, monitoring_wall, whiteboard_wall).
- A5: per-stage item slots in `layout.js` (3, 8, 16), placed where items read clearly and do not block walking paths.
- A6: `sync` places `state.items` by array index into slots with the right tier model; a buy or upgrade plays a short pop-in with a sparkle.

### S11 amendments: delayed consequences and new event kinds (sim)

Spec: the spec's **Decision events** section. Applies to Task S11; everything else in S11 stands.

- **New effect keys:** `later: [{ inWeeks, effects }]` pushes onto `state.scheduled`; `modifier: { key, value, weeks, label }` pushes onto `state.modifiers` with `untilWeek = week + weeks`; `followUp: { eventId, inWeeks }` schedules a follow-up event. A `calendar-start` step (order 10) applies due `scheduled` entries (effects now, or raise the event's decision) and drops expired modifiers with an info toast ("Four-day week trial has ended").
- **Modifier keys** map onto one helper, `modifierBonus(state, key)`, that the systems read alongside `itemBonus` and `researchBonus`: `output`, `meaningRecovery`, `meaningDrain`, `hype`, `brandPerWeek`, `churn`, `acquisition`, `staminaDrain`, `xp`, `oversight`, `rogueRisk`. Keep individual modifiers within the Progression guideline (plus or minus 50% at most).
- **New events (at least 12 more, bringing the total to 58+):**
  - People: `no_show` (someone stops showing up; they go `away` for 2 to 4 weeks; choices: check in kindly [their meaning up later, team +], dock pay [cash saved, their meaning down, team meaning down], ignore [nothing now; a follow-up if it repeats]), `quiet_quitter`, `public_complaint` (a staffer vents on LinkedOut; brand risk), `pay_equity_question`, `junior_overwhelmed`.
  - Leadership ideas (`kind: 'leadership'`, subject the founders): `ceo_replace_support` (a founder read a blog post and wants support fully automated; a tempting choice that sets support automation to 100% and schedules a follow-up), `four_day_week` (8-week trial modifier plus a `four_day_week_review` follow-up to keep or drop it), `ai_first_mandate` (all dials +25% now; meaning drain modifier; follow-up in 12 weeks), `rebrand` (cash now, brand effect `later` in 6 weeks, can flop), `pivot_pitch` (switch focus: kill a product, get a free medium project on a hot combo), `open_plan_office` (cheap now, meaning drain modifier, output modifier), `hackathon_week`, `founder_burnout` (even founders get tired: sabbatical or push through).
  - Every follow-up event is `random: false` and only raised by its scheduler.
- **Hints:** choices with `later`, `modifier`, or `followUp` include "effects later" in their hint unless the hint already explains the delay.
- **Tests:** a `later` effect applies exactly at `week + inWeeks`; a modifier changes its system while active and stops after `untilWeek`; a follow-up event raises its decision at the scheduled week; state stays JSON-safe with scheduled items outstanding; the no-show person is away and returns.

### UI additions for decision events (ui)

- U1 tray: an "Active effects" list of `state.modifiers` (label, weeks left, a small up or down arrow colored by sign).
- U5 decision popup: show each choice's hint; if it mentions effects later, add a small hourglass icon. Leadership-idea events show the founder's portrait and a speech-bubble framing.

### Task A8: Custom icon set (art), with U-lane integration

Spec: the spec's **Icons** section.

- ui first routes every icon through `icon(name, { size })` in `src/ui/icons.js`, returning emoji as a stand-in, and sends art an inventory: every icon name, where it appears, and its display size.
- art builds the set in `public/icons/` (SVG or PNG plus a `manifest.json` mapping icon name to file and a recommended size), in a consistent style: palette colors, thick ink outline, chunky rounded shapes, legible at 16 px. Object icons (categories, items, research tools) can be Blender renders of the game's own models from the isometric angle, with a transparent background; glyph icons (arrows, locks, warning, hourglass) are hand-drawn SVG.
- The set includes Slackk reaction icons and character emotes (A4's emote sprites use the same set).
- ui swaps `icon()` to read the manifest; emoji stay only as the fallback for a missing name, and a test fails if any name falls back.
- **Verify:** a `?icons=1` board showing the whole set at 16, 24, and 48 px on light and dark panels, snapped and critiqued with the art-direction checklist; then the panels re-snapped with the new icons.
- Order: after A6, before A7 (so the quality pass judges the final icons).


### U6 scope change: placeholder sound only

U6 ships placeholder sound effects (click, panel open and close, launch, alarm, hire, resign, notification blip) with volume and mute. No music and no typing ambience. Real audio is deferred to a later phase with its own design (see the spec's Audio section).

## Phase 3 addition: Standups

Spec: the spec's **Standups** section. Contract: the `standup` event and the `standup` chat channel.

### Task S14: Standups (sim)
- Policies `daily_standups` and `async_standups` in `src/data/policies.js` (mutually exclusive: turning one on turns the other off; unlock at week 0).
- A weekly system at the start of the in-game week (order 12, after calendar-start): when a standup policy is on, pick 3 to 5 present staff (not away), generate one line each from state (their project and its progress, mentoring, hard problem, oversight, an active outage, a pending migration), with mood overriding (coasting: flat lines; burnout: an empty string, meaning silence). Emit `{ type: 'standup', mode, lines }`; in async mode also emit each non-empty line as a `standup` chat event. Lines live in `src/data/standup.js` (templates, 40+, in the game's voice).
- Effects (balance.js): daily costs output (a modifier of about -3%) and gives institutional knowledge a small boost plus meaning +0.3/week for attendees; async has no output cost, half the knowledge boost, and no meaning lift. Keep the balance thresholds.
- Tests: lines reference real state, silent burnout, mutual exclusivity, async chat routing, no standup without a policy.

### Task A9: Standup staging (art)
- On a `daily` standup event: attendees walk to the whiteboard (or the meeting room on the Office Floor and HQ), form a loose circle, then each line plays as a speech bubble in turn (empty lines: a silent beat with a sweat or zzz emote), then everyone returns to their seats. A `renderer.setSpeed(k)` hook (main.js calls it) lets the renderer shorten it at 2x and skip the bubbles at 4x.
- Verify with snaps mid-circle on the garage and floor stages.

### Task U9: Standup UI (ui)
- A `#standup` Slackk channel. Policies appear automatically from POLICIES; show that the two are mutually exclusive in the Policies tab.

## Phase 4: Structure v2 (eras, unlocks, founding, placement)

Spec: the spec's **Structure v2** section. Contract: the "v2 changes" section of `src/contract/contract.md` (canonical). The mock sim already produces the v2 shape (office.placed with tile coordinates, era, eraSchedule, unlocks, goals, founding, and era/unlock/goal events), so every lane can start now. Order within each lane is as listed. A7 (art polish) continues in parallel, before A10.

### Task S15: Eras, approaches, unlocks, goals, open-ended run (sim)
- Start at January 2019 (dateOf and every year-based unlock rebased). eraSchedule is set in createGame with a per-run jitter of up to 13 weeks: chatgbt about 2022 Q4, agents about 2025 Q2, consolidation about 2029. An era arrival emits `era` and raises an era decision (for example the ChatGBT moment: "try copilots" / "wait and see" / "board wants an AI strategy"), respecting the decision gap.
- Pre-AI approaches as angles with an era tag: web, mobile, api, freemium, onprem (with combo fits in combos.js); AI angles gated by era. Models, automation dials, rogue agents, and AI research are unavailable in the Classic era; automation caps at 50% for support and marketing only during the ChatGBT era; the full dials arrive with Agents. Incumbents and clones adopt AI per era (appeal pressure).
- The unlock system (`unlocks`, the `unlock` event) with the triggers in the spec; policies unlock individually with triggers. Actions on locked systems return a reason ("Unlocks with your first launch").
- Goals (`goals`, the `goal` event) with small rewards; at least 15 goals across the run (getting started, first launch, first hire, first incident survived, the Office Floor, first award, 1,000 customers, HQ, category leader, IPO, acquisition offer, 5 years, 10 years, a Legend, a research tree complete).
- Open-ended endgame: remove the fixed run end; `retire` action (valid with an IPO available or an open acquisition offer) ends the run with won true and reason 'retired'; the IPO and acquisition become goals and retire options rather than automatic ends.
- Tests for era timing, gating, unlock triggers, goals, retire, and determinism.

### Task S16: Founding, placement, adjacency, desk capacity (sim)
- createGame founding options: 6 founder archetypes (src/data/founders.js) with skill profiles and a trait each; funding options (src/data/funding.js) with cash, score multiplier, and event hooks (investor pressure events for preseed, guilt-pressure events for family).
- Office grid data in src/data/office.js (grid, door, blocked tiles per stage); ITEMS gain footprint, kind ('furniture' for desk sets, meeting table, whiteboard, coffee corner, rack, plants, bookshelf; 'shop' for the upgradeable items), and adjacency { radius, key, value } where applicable. Furniture items get prices.
- Actions placeItem, moveItem, upgradeItem, sellItem per the contract, with validation (bounds, overlap, blocked tiles, and a path from the door to every desk: grid BFS). Capacity = number of desk sets; hire fails with 'No free desk'. The run starts with an empty office; the first goal is placing two desks.
- itemBonus sums global effects plus adjacency effects (per desk, averaged over staff), all under the 50% cap. Office upgrade auto-arranges placed furniture into the new grid (deterministic packing that keeps the path valid).
- Tests: placement validation cases, path check, capacity, adjacency math, auto-arrange validity, JSON safety.

### Task S17: Bots and balance for v2 (sim)
- Bots found a company (default founders and funding), place desks and items with a simple layout heuristic, and play from 2019 through the eras. Thresholds become: automateAll collapses in at least 70% of seeds once agents arrive; allHumans (careful, dials at 0) reaches an exit in at most 40% of seeds within 20 years; balanced reaches an exit within 20 years in 30 to 90% of seeds and beats allHumans by at least 20 points; sensible survives the opening. Report era-by-era stats (cash, staff, MRR at each era arrival) in the balance table.

### Task A10: Grid office and placed furniture (art)
- Stage shells become walls, windows, door, and floor only; everything else renders from `office.placed` (tile to world mapping per the contract's grid convention; rotations; the existing props and tier models). Desk sets render a desk, chair, and screen. Seats come from desk sets, not a fixed layout.
- The nav grid is rebuilt from placed furniture whenever it changes; walking, standups (around the meeting table if placed, else the whiteboard, else a clear floor spot), and wandering use it.
- Build-mode visuals: `renderer.setBuildMode({ itemId, rot } | null)` shows a ghost of the item under the cursor, tinted valid or invalid by a `renderer.validate(x, y, rot)` callback the UI provides from the sim; `renderer.pickTile(clientX, clientY) -> { x, y } | null`; hover highlight for existing placed items (for move and sell). Placement pops in; moves slide.
- Verify with snaps: an empty garage, a garage with 2 desks, a furnished floor, HQ, and build mode with a valid and an invalid ghost.

### Task A11: Era dressing (art)
- Small visual cues per era: Classic (no monitoring wall even if data says so, older monitors), ChatGBT (sticky notes with prompts, a "Try AI" poster), Agents (monitoring wall glow, agent status lights), Consolidation (lawyer-grey conference tables, a "Compliance" binder). Plus an era-transition flourish (the skyline or window light shifts, confetti-free).

### Task U10: Founding screens (ui)
- After New Game: company name, logo color, tagline; pick 2 of 6 founder archetype cards (portrait, strengths, trait); funding choice with plain-words consequences. Then into the empty garage with the Goals card showing "place 2 desks". Replaces the tutorial's Build step; the tutorial keeps only HUD and speed basics.

### Task U11: Build mode (ui)
- The Office panel becomes a build palette: furniture and shop items with price and footprint; picking one enters build mode (the renderer ghost; click to place via placeItem; R rotates; Esc exits). Clicking a placed item offers move, upgrade, and sell. Invalid placement shows the sim's reason. Adjacency previews: while placing, show which desks gain which bonus.

### Task U12: Unlock presentation, Goals card, era cards, retire (ui)
- Menu buttons appear only when unlocked (the `unlock` event slides them in with a "New!" badge and a one-card explainer the first time); the Goals card in the tray; the era card (a large, skippable announcement with what changed and the era decision if any); the retire flow (a Retire button in Reports when available: IPO or open offer, with a confirmation showing the projected score).

### Task L3: Wall-clock pacing simulator (lead)
- Extract the clock, event pacing, and menu-pause logic from main.js into `src/pacing.js` (pure, shared by main.js and the tool). `scripts/pace.js` runs the real sim through that clock with a simulated player (a bot plus modelled menu time per decision and per action) and prints a timeline with wall-clock timestamps (mm:ss at the chosen speed) of every presented event, plus metrics: popups per real minute, the gap distribution between decisions, toasts per minute after the UI budget, minutes to first launch, to each era, and to each goal. Used to tune pacing without a browser.

## Phase 5: Conversations and bubble pacing

From the user's playtest: speech bubbles need reasonable timing; employees should talk to each other rather than each saying one line; conversations need far more variety, situational, with some randomness. The chat event already carries `replyTo`, which is enough to model an exchange (a root line plus replies).

### L3 addition: bubble timing in the pacer (lead)
- Replies are not spread evenly across the week: a reply is released after its parent with a conversational delay (about 1.2 s plus 0.04 s per character of the parent at 1x, scaled by speed), and a speaker never has two bubbles overlapping. The pacing simulator reports bubble density (bubbles on screen per second, max concurrent) and flags overlaps.

### Task S18: Conversation content (sim)
- Grow `src/data/threads.js` into a conversation system: exchanges of 2 to 6 turns between 2 or 3 people, each turn picking from several variants, with slots filled from real state (products, coworkers, models, incumbents, the era, the office, recent events) and conditions on mood, role, relationship (mentor and mentee, same project, new hire and veteran, founder and anyone), era, and recent events.
- Target: 150+ exchanges with at least 3 variants per turn, weighted by situation so what people talk about reflects what is happening (a launch week, an outage, a burnout, a new AI era, a new office, a standup policy change). Add a small amount of controlled randomness (tangents, running jokes that callback across weeks, an occasional non sequitur).
- Anti-repetition: a per-exchange cooldown and a recent-template memory across all channels; a test that 200 weeks of a busy company produce no exact repeated line within 30 lines.
- Every turn is a chat event with `replyTo` pointing at the exchange's root, so the UI threads it and the renderer can stage it.

### Task A12: Conversational staging (art)
- When a chat event's speaker and its root's speaker are both in the office, stage it as a conversation: the replier turns toward (or walks a few tiles toward) the other speaker, bubbles alternate with the pacer's timing, and a small "..." typing indicator bridges turns. Solo lines stay as single bubbles. Keep the 40-label cap; at 4x, show only the last line of an exchange.
