// Clips and screenshots for scripts/capture.js, ordered like the review-session plan
// (docs/superpowers/specs/2026-09-24-review-session-plan.md). Each item:
//   id, title, query (URL params: mock=<scenario> or seed=N, speed, time, ...), seconds, seed (for
//   the page's Math.random), warmup (seconds run before recording starts), hideUi, gif,
//   still (screenshots only, no video), setup (page JS run once after boot, may be async),
//   actions ([{ at: seconds, js }] run during the clip), screenshots ([seconds] saved as PNG).
// Page JS has window.__HITL (state, dispatch, tickN, emit, controls), window.__HITL_UI (dev only),
// and window.__capture. Setups change state directly to stage a moment; that is fine for capture.

// Clicks the visible button with this label (a player pressing it).
const CLICK = (label) => `[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim() === ${JSON.stringify(label)})?.click()`;
// Clicks the nth visible element matching a CSS selector.
const CLICK_SEL = (sel, n = 0) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((b) => b.getClientRects().length)[${n}]?.click()`;
// A key press as the UI hears it.
const KEY = (key, code = key) => `dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, bubbles: true }))`;
// Closes the tutorial, cards, and panels until the UI reports nothing open.
const IDLE = `(() => { for (let i = 0; i < 12 && window.__HITL.clock.busy; i++) ${KEY('Escape')}; })()`;
// Clicks the visible button whose label starts with this text (tabs like "Hire (8)").
const CLICK_STARTS = (label) => `[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith(${JSON.stringify(label)}))?.click()`;
// Cards that turn up once play resumes (unlocks, tips): a player dismisses them in the first seconds.
// Unlock cards close with their "Got it" button; panels and tips close with Escape.
// With escape false only "Got it" is pressed, so popups that close on Escape (launch results) stay.
const DISMISS_AT = (times, { escape = true } = {}) => times.map((at) => ({ at, js: `(() => { for (let i = 0; i < 12; i++) { const b = [...document.querySelectorAll('button')].find((x) => x.getClientRects().length && x.textContent.trim() === 'Got it'); if (b) b.click(); else if (${escape} && window.__HITL.clock.busy) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); else break; } })()` }));
// Every second through a clip of live play; decisions get the first choice after a moment to read.
const DISMISS_EVERY = (seconds) => [
  ...DISMISS_AT([0.1, ...Array.from({ length: Math.floor(seconds) }, (_, i) => i + 1)]),
  ...Array.from({ length: Math.floor(seconds / 4) }, (_, i) => ({ at: 4 * (i + 1), js: `(() => { const H = window.__HITL; if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 }); })()` })),
];
// Types into the nth visible text input the way a player would.
const TYPE = (text, n = 0) => `(() => { const el = [...document.querySelectorAll('input.text')].filter((x) => x.getClientRects().length)[${n}]; if (el) { el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`;

// The first person in the office (present, not remote or away).
const PICK = `(() => { const s = window.__HITL.state; return s.staff.find((p) => p.mood !== 'away' && !p.remote && p.assignment?.type !== 'sabbatical'); })()`;

// Fast-forwards a real game with a bot, straight through the sim (no presentation), until `until`
// (a JS condition on s) holds or `weeks` pass. With keepDecision it stops at the first decision
// raised after minWeeks.
const PLAY = ({ weeks, bot = 'balanced', until = 'false', keepDecision = false, minWeeks = 0, after = '' }) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  for (let i = 0; i < ${weeks} && !s.gameOver; i++) {
    if (${until}) break;
    b.botDecide('${bot}', s);
    b.botTurn('${bot}', s);
    sim.tick(s);
    if (${keepDecision} && s.pendingDecision && i >= ${minWeeks}) break;
  }
  if (!${keepDecision}) b.botDecide('${bot}', s);
  ${after}
  ${IDLE};
})()`;

// Three saved companies at different stages, then back to the title.
const THREE_SAVES = `(async () => {
  const c = window.__HITL.controls;
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const make = [['Northwind Labs', 11, '#4f8cff', 30], ['Paperclip & Co', 12, '#e5484d', 140], ['Quiet Robots', 13, '#34c38f', 420]];
  for (const [name, seed, color, weeks] of make) {
    c.newGame({ companyName: name, seed, logoColor: color, tagline: 'Made by people, mostly.', funding: 'bootstrapped' });
    const s = window.__HITL.state;
    for (let i = 0; i < weeks && !s.gameOver; i++) { b.botDecide('balanced', s); b.botTurn('balanced', s); sim.tick(s); }
    b.botDecide('balanced', s);
    c.save();
  }
  c.newGame();
})()`;

// Everyone in the office: no lockdown, and an office work policy (the sim keeps nobody remote).
const IN_OFFICE = 's.lockdown = null; s.workPolicy = "office"; for (const p of s.staff) { p.remote = false; p.call = null; }';

// Presents the recent Slackk history the sim kept, since a fast-forward shows nothing as it goes.
const CHAT_HISTORY = 'window.__HITL.emit((s.chatLog ?? []).slice(-15));';

const ERA = (id) => `(() => { const s = window.__HITL.state; s.era = { id: '${id}', since: s.week }; })()`;

export const ITEMS = [
  // 1. First contact
  { id: '1-1-title-empty', title: '1.1 Title screen, no saves', query: '', still: true, screenshots: [2] },
  { id: '1-1-title-saves', title: '1.1 Title screen with 3 saves', query: '', setup: THREE_SAVES, still: true, screenshots: [2] },
  {
    id: '1-1-continue-recap', title: '1.1 Continue and the Welcome back recap', query: '', setup: THREE_SAVES, seconds: 12,
    actions: [{ at: 1.5, js: CLICK_SEL('.tl-slot') }], screenshots: [4],
  },
  {
    id: '1-2-founding', title: '1.2 Founding: name, logo, founders, funding', query: '', seconds: 22,
    actions: [
      { at: 1.0, js: CLICK('New Game') },
      { at: 2.5, js: TYPE('Lantern Works') },
      { at: 4.0, js: CLICK_SEL('.swatch', 3) },
      { at: 6.0, js: CLICK('Next: founders') },
      { at: 8.0, js: CLICK_SEL('.fcard', 0) },
      { at: 9.5, js: CLICK_SEL('.fcard', 3) },
      { at: 12.0, js: CLICK('Next: funding') },
      { at: 14.5, js: CLICK_SEL('.fund', 1) },
      { at: 17.0, js: CLICK('Start the company') },
    ],
    screenshots: [5, 11, 16],
  },
  {
    id: '1-2-no-builder', title: '1.2 Founders with no builder (warning)', query: '', still: true,
    actions: [
      { at: 0.3, js: CLICK('New Game') },
      { at: 0.8, js: CLICK('Next: founders') },
      { at: 1.3, js: `(() => { const cards = [...document.querySelectorAll('.fcard')]; for (const c of cards.filter((c) => !/Engineer|Designer|Researcher/.test(c.textContent)).slice(0, 2)) c.click(); })()` },
    ],
    screenshots: [2.5],
  },
  {
    id: '1-3-garage-opening', title: '1.3 Empty garage, first desks, tutorial tips', query: 'seed=21&speed=1', seconds: 26,
    actions: [
      { at: 0.5, js: 'window.__HITL_UI.startTutorial()' },
      ...[4, 7, 10, 13, 16].map((at) => ({ at, js: KEY('Enter') })),
      { at: 18, js: `window.__HITL.dispatch({ type: 'placeItem', itemId: 'desk', x: 2, y: 2, rot: 0 })` },
      { at: 20, js: `window.__HITL.dispatch({ type: 'placeItem', itemId: 'desk', x: 4, y: 2, rot: 0 })` },
    ],
    screenshots: [3, 22],
  },

  // 2. The office
  {
    id: '2-1-build-mode', title: '2.1 Build mode: the Office palette', query: 'seed=22&speed=1', seconds: 12,
    setup: PLAY({ weeks: 60 }),
    actions: [{ at: 1, js: KEY('f', 'KeyF') }],
    screenshots: [3, 8],
  },
  ...['garage', 'floor', 'hq'].flatMap((stage) => ['day', 'night'].map((time) => ({
    id: `2-2-${stage}-${time}`, title: `2.2 ${stage} by ${time}`, query: `mock=${stage}&time=${time}`, still: true, hideUi: true, screenshots: [2],
  }))),
  {
    id: '2-2-office-move', title: '2.2 Moving to a bigger office', query: 'seed=23&speed=1', seconds: 14,
    // Play until the Office Floor's gate opens (before the bot moves itself), then make the move.
    setup: PLAY({ weeks: 400, until: "!gate.officeGateReason(s, OFFICE_STAGES[1]) && s.office.stage === 0", after: 's.cash = Math.max(s.cash, 2e6);' })
      .replace("const s = window.__HITL.state;", "const s = window.__HITL.state; const gate = await import('/src/sim/products.js'); const { OFFICE_STAGES } = await import('/src/data/office.js');"),
    actions: [{ at: 2, js: `window.__HITL.dispatch({ type: 'upgradeOffice' })` }, ...DISMISS_AT([3, 4, 5, 7])], screenshots: [1, 10],
  },
  { id: '2-3-perks', title: '2.3 Perks in use', query: 'mock=hq&speed=2', seconds: 30, screenshots: [10, 20] },
  {
    id: '2-4-pets', title: '2.4 Pets: dog visits, cat perches', query: 'mock=floor&speed=1', seconds: 30,
    setup: `(() => { const s = window.__HITL.state; s.pets = [{ id: 'pet1', species: 'dog', name: 'Biscuit', ownerId: s.staff[0].id, arrivedWeek: s.week }, { id: 'pet2', species: 'cat', name: 'Mochi', ownerId: s.staff[1].id, arrivedWeek: s.week }]; })()`,
    screenshots: [8, 20],
  },
  ...['classic', 'chatgbt', 'agents', 'consolidation', 'plateau'].map((era) => ({
    id: `2-5-era-${era}`, title: `2.5 Era dressing: ${era}`, query: 'mock=floor&time=day', still: true, hideUi: true, setup: ERA(era),
    actions: [{ at: 2.2, js: `window.__HITL.controls.focusStaff(window.__HITL.state.staff[0].id)` }], screenshots: [2, 5],
  })),
  {
    id: '2-5-era-arrival', title: '2.5 An era arrives (Agents)', query: 'mock=floor&speed=1', seconds: 16, setup: ERA('chatgbt'),
    actions: [{ at: 1, js: `(() => { ${ERA('agents')}; window.__HITL.emit([{ type: 'era', eraId: 'agents' }]); })()` }], screenshots: [3],
  },
  {
    id: '2-6-rival', title: '2.6 Rival touches', query: 'mock=floor&time=day', still: true,
    setup: `(() => { const s = window.__HITL.state; s.rival = { name: 'Synergex', founderName: 'Chad Vance', logoColor: '#e5484d', categoryId: 'crm', strength: 60, status: 'rising' }; })()`,
    screenshots: [2],
  },

  // 3. People
  { id: '3-1-lineup', title: '3.1 Characters and variety', query: 'mock=hq&time=day', still: true, hideUi: true, screenshots: [2] },
  {
    id: '3-1-closeups', title: '3.1 Close-ups', query: 'mock=floor&time=day', still: true, hideUi: true,
    actions: [{ at: 0.2, js: `window.__HITL.controls.focusStaff(window.__HITL.state.staff[2].id)` }, { at: 3.2, js: `window.__HITL.controls.focusStaff(window.__HITL.state.staff[5].id)` }],
    screenshots: [3, 6],
  },
  {
    id: '3-2-portraits', title: '3.2 Portraits in menus', query: 'seed=24&speed=0', still: true, setup: PLAY({ weeks: 120 }),
    actions: [{ at: 0.5, js: KEY('s', 'KeyS') }, { at: 3.5, js: `window.__HITL_UI.openStaff(window.__HITL.state.staff[1].id)` }],
    screenshots: [3, 6],
  },
  {
    id: '3-3-poses', title: '3.3 Poses: typing, tired, burnout, napping', query: 'mock=floor&speed=1', seconds: 14,
    setup: `(() => { const s = window.__HITL.state; s.staff[1].mood = 'burnout'; s.staff[2].mood = 'coasting'; s.staff[3].stamina = 5; })()`,
    actions: [{ at: 0.2, js: `window.__HITL.controls.focusStaff(window.__HITL.state.staff[1].id)` }], screenshots: [6],
  },
  ...[1, 2].map((speed) => ({
    id: `3-4-conversations-${speed}x`, title: `3.4 Conversations at ${speed}x`, query: `seed=25&speed=${speed}`, seconds: 40,
    setup: PLAY({ weeks: 140, after: IN_OFFICE }), actions: DISMISS_EVERY(40), screenshots: [15, 30],
  })),
  {
    // The standup gathers on the left, behind the HUD; speech bubbles are not part of the UI layer.
    id: '3-5-standup', title: '3.5 A staged standup', query: 'seed=26&speed=1', seconds: 30, hideUi: true,
    setup: PLAY({ weeks: 110, after: `${IN_OFFICE} window.__HITL.dispatch({ type: 'setPolicy', id: 'async_standups', on: false }); window.__HITL.dispatch({ type: 'setPolicy', id: 'daily_standups', on: true });` }),
    actions: DISMISS_EVERY(30), screenshots: [12],
  },
  ...[['early', 20], ['mid', 300], ['late', 700]].map(([when, weeks]) => ({
    id: `3-6-slackk-${when}`, title: `3.6 Slackk, ${when} game`, query: 'seed=27&speed=0', still: true, setup: PLAY({ weeks }), screenshots: [2],
  })),

  // 4. Screens and decisions
  { id: '4-1-hud', title: '4.1 HUD, Needs You, Goals, Active effects', query: 'seed=28&speed=0', still: true, setup: PLAY({ weeks: 150 }), screenshots: [2] },
  {
    id: '4-2-staff-hire', title: '4.2 Staff and Hire', query: 'seed=28&speed=0', still: true, setup: PLAY({ weeks: 150 }),
    actions: [{ at: 0.5, js: KEY('s', 'KeyS') }, { at: 3.5, js: CLICK_STARTS('Hire') }], screenshots: [3, 6],
  },
  {
    id: '4-3-build-panel', title: '4.3 Starting a product', query: 'seed=29&speed=0', seconds: 14, setup: PLAY({ weeks: 40 }),
    actions: [{ at: 1, js: KEY('b', 'KeyB') }], screenshots: [4, 10],
  },
  {
    id: '4-4-reports', title: '4.4 Products and Reports', query: 'seed=30&speed=0', still: true, setup: PLAY({ weeks: 300 }),
    actions: [{ at: 0.5, js: KEY('r', 'KeyR') }], screenshots: [3],
  },
  ...[1, 2, 3].map((n) => ({
    id: `4-5-decision-${n}`, title: `4.5 A decision (${n})`, query: `seed=${40 + n}&speed=1`, seconds: 12,
    setup: PLAY({ weeks: 900, keepDecision: true, minWeeks: [60, 260, 520][n - 1] }), screenshots: [4],
  })),
  {
    id: '4-6-unlock-card', title: '4.6 An unlock card and New! slide-in', query: 'seed=31&speed=1', seconds: 12, setup: PLAY({ weeks: 30 }),
    actions: [{ at: 1, js: `window.__HITL.emit([{ type: 'unlock', key: 'research' }])` }], screenshots: [4],
  },
  { id: '4-7-settings', title: '4.7 Settings', query: 'seed=32&speed=0', still: true, actions: [{ at: 0.5, js: 'window.__HITL_UI.openSettings()' }], screenshots: [2] },

  // 5. Moments
  {
    id: '5-1-first-launch', title: '5.1 First launch and reviews', query: 'seed=33&speed=1', seconds: 22,
    setup: PLAY({ weeks: 80, until: "s.projects.some((j) => j.kind === 'new' && j.progress / j.pointsNeeded > 0.9) && s.stats.launches === 0" }),
    // Unlock cards that arrive with the launch are dismissed; the launch results stay up.
    actions: DISMISS_AT([0.1, 0.6, 1.5, 3, 6, 8, 10, 12], { escape: false }),
    screenshots: [9, 16],
  },
  {
    id: '5-2-incident', title: '5.2 Incident and outage', query: 'mock=floor&speed=1', seconds: 16,
    actions: [{ at: 1, js: `(() => { const s = window.__HITL.state; const p = s.products[0]; s.outage = { productId: p.id, kind: 'outage', severity: 3, weeks: 2, unrecoverable: false }; window.__HITL.emit([{ type: 'incident', kind: 'outage', productId: p.id, caught: false, severity: 3 }]); })()` }],
    screenshots: [4],
  },
  {
    id: '5-3-lockdown', title: '5.3 Lockdown: the empty office', query: 'mock=floor&speed=1', seconds: 20,
    setup: `(() => { const s = window.__HITL.state; const stayer = s.staff[0]; s.lockdown = { since: s.week, until: s.week + 20, stayerId: stayer.id }; for (const p of s.staff) { p.remote = p.id !== stayer.id; p.call = p.remote ? { muted: Math.random() < 0.3, frozen: Math.random() < 0.15, badCamera: Math.random() < 0.2 } : null; } })()`,
    screenshots: [5, 14],
  },
  {
    id: '5-4-waffle-party', title: '5.4 Waffle Party (incentives)', query: 'mock=floor&speed=1', seconds: 19, warmup: 1.5,
    // The incentive card pauses the game while it is open; the party plays once it is dismissed.
    actions: [
      { at: 0.5, js: `window.__HITL.emit([{ type: 'incentive', staffId: ${PICK}.id, reward: 'waffle_party' }])` },
      { at: 3.0, js: CLICK('Onward') },
    ],
    screenshots: [1.5, 10],
  },
  {
    id: '5-5-burnout-resign', title: '5.5 Burnout and a resignation', query: 'mock=floor&speed=1', seconds: 16,
    setup: `(() => { const p = window.__HITL.state.staff[3]; p.mood = 'burnout'; p.meaning = 8; window.__HITL.controls.focusStaff(p.id); })()`,
    actions: [{ at: 7, js: `(() => { const p = window.__HITL.state.staff[3]; window.__HITL.emit([{ type: 'resign', staffId: p.id, name: p.name, fired: false }]); })()` }],
    screenshots: [3, 10],
  },
  {
    id: '5-6-anniversary', title: '5.6 The 20th anniversary ending', query: 'seed=34&speed=1', seconds: 16, setup: PLAY({ weeks: 1030 }),
    actions: [{ at: 1, js: `(() => { const s = window.__HITL.state; s.gameOver = { won: true, reason: 'anniversary', score: 51240, epilogue: ['Twenty years. The garage is a museum now, which is to say a garage.'] }; window.__HITL.emit([{ type: 'gameOver' }]); })()` }],
    screenshots: [5],
  },

  // README (group 'readme'): hero stills at 1920x1080 with the UI, from real seeded games so every
  // shot is internally consistent (date, era, effects, goals), plus one short loop.
  {
    id: 'readme-garage', group: 'readme', title: 'The garage opening: founders and the first desks', query: 'seed=1&speed=1', still: true,
    setup: PLAY({ weeks: 1 }), warmup: 3,
    // Nothing has been said in Slackk yet this early, so the panel is folded away.
    actions: [...DISMISS_AT([0.1, 0.5]), { at: 0.3, js: KEY('c', 'KeyC') }], screenshots: [3],
  },
  {
    // The bot starts more product updates than it staffs; as a player would, cancel the ones nobody
    // is on, so the Needs You tray shows the game rather than the bot. Shot before the first live tick.
    id: 'readme-hq', group: 'readme', title: 'A busy Agents-era HQ with pets and perks', query: 'seed=1&speed=1&time=day', still: true,
    setup: PLAY({ weeks: 500, until: "s.office.stage === 2 && s.era.id === 'agents'", after: IN_OFFICE + CHAT_HISTORY + "s.projects = s.projects.filter((j) => j.kind !== 'update' || s.staff.some((p) => p.assignment?.type === 'project' && p.assignment.targetId === j.id));" }), warmup: 2,
    actions: DISMISS_EVERY(4), screenshots: [4],
  },
  {
    id: 'readme-lockdown', group: 'readme', title: 'Lockdown: the video call over the empty office', query: 'seed=1&speed=1', still: true,
    setup: PLAY({ weeks: 200, until: 's.lockdown', after: CHAT_HISTORY }), warmup: 3,
    actions: DISMISS_EVERY(6), screenshots: [6],
  },
  {
    id: 'readme-loop', group: 'readme', title: 'The office in motion (loop)', query: 'seed=1&speed=1&time=day', seconds: 7, warmup: 6, hideUi: true,
    setup: PLAY({ weeks: 500, until: "s.office.stage === 2 && s.era.id === 'agents'", after: IN_OFFICE }),
  },
];
