// Clips and screenshots for scripts/capture.js, ordered like the review-session plan
// (docs/superpowers/specs/2026-09-24-review-session-plan.md). Each item:
//   id, title, query (URL params: mock=<scenario> or seed=N, speed, time, ...), seconds, seed (for
//   the page's Math.random), warmup (seconds run before recording starts), hideUi, gif,
//   still (screenshots only, no video), moment (a find query, scripts/events/find.js: the item opens
//   at that indexed moment, its decision open; with pre: true it opens the week before and the game's
//   own tick raises the decision), setup (page JS run once after boot, may be async),
//   actions ([{ at: seconds, js }] run during the clip), screenshots ([seconds] saved as PNG), sound (an
//   item made for --audio).
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

// Office Space nods (group 'nods', #383): each opens at an indexed moment (the event index follows
// the sim code, so a history that shifts still finds one) and plays the week into its decision; the
// card shows, a choice is made, and the camera frames what it stages. A nod that stages nothing has no
// snapshot in the index, so it fast-forwards seed 1 with the allHumans bot to its decision instead.
const NOD = (eventId, weeks) => PLAY({ weeks, bot: 'allHumans', until: `s.pendingDecision?.eventId === '${eventId}'`, keepDecision: true, minWeeks: 1e9 });
// A bare frame for the reel: the side overlays (top bar, tray, Yak, menu, toasts) hidden, so the
// office and the beat fill the frame; the decision card and the moment caption stay. YAK brings Yak
// back, at the right where the reel's crop keeps it, for a beat whose payoff is a message.
const BARE = `(() => { const st = document.createElement('style'); st.id = 'reel-bare'; st.textContent = '#ui .topbar, #ui .tray, #ui .bottom, #ui .toasts { display: none !important; }'; document.head.append(st); })()`;
const YAK = `(() => { const st = document.getElementById('reel-bare'); if (st) st.textContent = '#ui .topbar, #ui .tray, #ui .menu, #ui .toasts { display: none !important; } #ui .chat.yak { position: fixed !important; left: auto !important; right: 24px !important; top: 300px !important; bottom: auto !important; width: 380px !important; }'; })()`;
// Unlock and tip cards that queue up during a fast-forward, closed the way a player would ("Later",
// "Got it"), so the nod's decision card is what shows.
const CLEAR_CARDS = `(() => { for (let i = 0; i < 8; i++) { const b = [...document.querySelectorAll('button')].find((x) => x.getClientRects().length && ['Later', 'Got it', 'Next', 'Onward', 'Nice!'].includes(x.textContent.trim())); if (!b) break; b.click(); } })()`;
// Runs the sim a week at a time (at most `max`, the bot deciding) straight through, with nothing
// presented on the way (no launch cards, incidents or toasts), until a Yak message containing `until`
// is in the log; then shows only the new messages that contain one of `show`. A nod's payoff weeks
// later lands on screen now, and quietly.
const QUIET_UNTIL_CHAT = (until, show, max) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const H = window.__HITL, s = H.state;
  // New messages by week: the log is capped, so its length stops growing once it is full.
  const w0 = s.week;
  const fresh = () => (s.chatLog ?? []).filter((m) => m.week >= w0);
  const has = () => fresh().some((m) => (m.text ?? '').includes(${JSON.stringify(until)}));
  for (let i = 0; i < ${max} && !has(); i++) { b.botDecide('allHumans', s); b.botTurn('allHumans', s); sim.tick(s); }
  b.botDecide('allHumans', s);
  H.emit(fresh().filter((m) => ${JSON.stringify(show)}.some((k) => (m.text ?? '').includes(k))));
})()`;
// Marks the clip time (window.__captureMarks, saved in index.json) when a moment starts or ends, so
// the reel lays music in on the moment's own start signal.
const MARK_MOMENTS = `(() => { const t0 = window.__capture.now; window.__captureMarks = []; addEventListener('hitl:moment', (e) => window.__captureMarks.push({ t: +((window.__capture.now - t0) / 1000).toFixed(3), label: 'hitl:moment ' + e.detail.phase + ' ' + e.detail.key })); })()`;
// Keeps the camera on what a beat is about from `from` to `to`: eased onto the staged prop (which
// appears only once the week raises the decision), and left to the game's moment camera while the
// printer or the visitor moment plays.
const AIM = (props, zoom) => `(() => { const R = window.__hitlRender; const pm = R.moments?.printerState; const v = R.moments?.visitorState;
  // A moment under way: the game's moment camera follows it. Otherwise ease onto the staged prop.
  if (pm || v) return;
  const o = R.props.current().find((x) => ${JSON.stringify(props)}.includes(x.prop))?.obj; if (!o) return;
  const p = o.getWorldPosition(new o.position.constructor());
  (R.easeTo ?? R.focusAt)(p.x, p.z, ${zoom}); })()`;
// Turns the view (as the player's E key does) to whichever of the four angles sees the staged prop
// most clearly. Each angle is tried on a copy of the camera turned about the prop; rays from it to
// points on the prop count those that reach the prop first. The chosen turn then eases in on screen.
const BEST_VIEW = (props) => `(() => { const R = window.__hitlRender, T = R.THREE;
  const o = R.props.current().find((x) => ${JSON.stringify(props)}.includes(x.prop))?.obj; if (!o || window.__viewPicked) return;
  window.__viewPicked = true;
  const box = new T.Box3().setFromObject(o), c = box.getCenter(new T.Vector3()), ray = new T.Raycaster(); ray.camera = R.camera;
  const pts = [c, ...[[0.3, 0.8, 0.3], [0.7, 0.8, 0.7], [0.3, 0.8, 0.7], [0.7, 0.8, 0.3]].map(([a, b, d]) => new T.Vector3(box.min.x + (box.max.x - box.min.x) * a, box.min.y + (box.max.y - box.min.y) * b, box.min.z + (box.max.z - box.min.z) * d))];
  const own = (h) => { for (let x = h.object; x; x = x.parent) if (x === o) return true; return false; };
  const off = R.camera.position.clone().sub(c);
  let best = -1, turns = 0;
  for (let i = 0; i < 4; i++) {
    const eye = off.clone().applyAxisAngle(new T.Vector3(0, 1, 0), i * Math.PI / 2).add(c);
    let n = 0;
    // Only what stands near the prop can hide it (the backdrop and the cutaway lie far off the line).
    for (const p of pts) { const far = eye.distanceTo(p); ray.set(eye, p.clone().sub(eye).normalize()); const h = ray.intersectObject(R.scene, true).find((x) => x.object.visible && x.object.isMesh && x.distance > far - 3); if (h && own(h)) n++; }
    if (n > best) { best = n; turns = i; }
  }
  for (let i = 0; i < turns; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true })); })()`;
const FOLLOW = (props, zoom, from, to) => Array.from({ length: Math.round((to - from) * 4) }, (_, i) => ({ at: from + i / 4, js: AIM(props, zoom) }));

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

// Presents the recent Yak history the sim kept, since a fast-forward shows nothing as it goes.
const CHAT_HISTORY = 'window.__HITL.emit((s.chatLog ?? []).slice(-15));';

const ERA = (id) => `(() => { const s = window.__HITL.state; s.era = { id: '${id}', since: s.week }; })()`;

// Unstaffed product updates the bot started are dropped, as for readme-hq, so Needs You shows the game.
const DROP_UNSTAFFED = "s.projects = s.projects.filter((j) => j.kind !== 'update' || s.staff.some((p) => p.assignment?.type === 'project' && p.assignment.targetId === j.id));";
// Idle people go onto the projects nobody is on, as a player would.
const STAFF_IDLE = "for (const j of s.projects) { if (s.staff.some((p) => p.assignment?.type === 'project' && p.assignment.targetId === j.id)) continue; const p = s.staff.find((x) => x.assignment?.type === 'idle' && !x.remote && x.mood !== 'away'); if (p) sim.dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: j.id } }); }";
// A real game played to week 176, then the sim's own staging. The sim is deterministic, so a copy of
// the state is ticked ahead to find the week the reward lands, and the game is advanced to the week
// before it: the first live week awards it on camera.
const STAGED = (reward) => PLAY({ weeks: 176, after: `${IN_OFFICE}${CHAT_HISTORY}${DROP_UNSTAFFED}${STAFF_IDLE}
  sim.stageIncentive(s, '${reward}');
  const ahead = structuredClone(s); let weeks = 0;
  while (weeks < 12) { weeks++; const ev = sim.tick(ahead) ?? []; if (ev.some((e) => e.type === 'incentive' && e.reward === '${reward}')) break; b.botDecide('balanced', ahead); }
  for (let i = 1; i < weeks; i++) { sim.tick(s); b.botDecide('balanced', s); }` });
const WAFFLE_SETUP = STAGED('waffle_party');
// Music night comes naturally: the Incentives Program on from its unlock, played until the fifth
// reward is due next week, so the live week raises the genre decision.
const MUSIC_DUE = "((s.policies.incentives || sim.dispatch(s, { type: 'setPolicy', id: 'incentives', on: true })), s.flags.incentiveCount === 4 && s.week - s.flags.incentiveWeek >= (await import('/src/sim/balance.js')).B.incentiveEveryWeeks - 1)";
const MUSIC_SETUP = PLAY({ weeks: 400, until: MUSIC_DUE, after: IN_OFFICE + CHAT_HISTORY + DROP_UNSTAFFED + STAFF_IDLE });
// Clicks through the incentive card each second, so the party plays as soon as it is awarded;
// decisions get the first choice.
const WAFFLE_ACTIONS = (seconds) => [
  ...Array.from({ length: Math.floor(seconds) }, (_, i) => ({ at: i + 0.5, js: CLICK('Onward') })),
  ...DISMISS_EVERY(seconds).filter((a) => a.at % 4 === 0),
];
// Follows one person with the camera as close as it zooms.
const CLOSE_UP = (id) => `(() => { window.__HITL.controls.focusStaff(${id}); document.getElementById('scene').dispatchEvent(new WheelEvent('wheel', { deltaY: -400, cancelable: true })); })()`;

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
  // The procedural poses and the authored rig (?rig=1), same scene, for comparison. The camera
  // follows a typist, then cuts to someone napping on a couch placed for the shot: the two poses
  // the rig authors.
  ...[['', 'Poses', ''], ['-rig', 'Poses (authored rig)', '&rig=1']].map(([suffix, name, rig]) => ({
    id: `3-3-poses${suffix}`, title: `3.3 ${name}: typing, then a couch nap`, query: `mock=floor&speed=1${rig}`, seconds: 16,
    setup: `(() => { const H = window.__HITL; const s = H.state; s.staff[1].mood = 'burnout'; s.staff[2].mood = 'coasting'; s.staff[3].stamina = 5; window.__couch = H.dispatch({ type: 'placeItem', itemId: 'couch', x: 1, y: 9, rot: 0 })?.id; })()`,
    // Focus is repeated each second: people have no position until the first sync, and the napper
    // walks. A wheel step after each focus takes the camera from the focus zoom to the closest one.
    actions: [
      { at: 1, js: `window.__HITL.controls.renderer.perks.send([window.__HITL.state.staff[5].id], window.__couch, { nap: true, dur: 40 })` },
      ...[1.5, 2.5, 3.5, 4.5, 5.5, 6.5].map((at) => ({ at, js: CLOSE_UP('window.__HITL.state.staff[0].id') })),
      ...[8, 9, 10, 11, 12, 13, 14, 15].map((at) => ({ at, js: CLOSE_UP('window.__HITL.state.staff[5].id') })),
    ],
    screenshots: [6, 14],
  })),
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
  // The fast-forward sends Yak nothing, so the recent history the sim kept is presented first.
  ...[['early', 20], ['mid', 300], ['late', 700]].map(([when, weeks]) => ({
    id: `3-6-yak-${when}`, title: `3.6 Yak, ${when} game`, query: 'seed=27&speed=0', still: true, setup: PLAY({ weeks, after: CHAT_HISTORY }), screenshots: [2],
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
    // Music night as a staged dance break: the winner, a genre, and four dancers from the office.
    id: '5-4b-music-night', title: '5.4b Music night: a dance break', query: 'mock=floor&speed=1', seconds: 22, warmup: 1.5,
    actions: [
      { at: 0.5, js: `(() => { const s = window.__HITL.state; const here = s.staff.filter((p) => p.mood !== 'away' && !p.remote); window.__HITL.emit([{ type: 'incentive', staffId: here[0].id, reward: 'music_night', genre: 'corporate_synthwave', dancers: here.slice(1, 5).map((p) => p.id) }]); })()` },
      ...Array.from({ length: 21 }, (_, i) => ({ at: i + 1, js: CLICK('Onward') })),
    ],
    screenshots: [6, 12, 18],
  },
  {
    // The real sim's music night: the genre decision stays on screen a moment, then the first genre
    // (Corporate Synthwave) is picked and the dance break plays.
    id: '5-4b-music-night-real', title: '5.4b Music night in a real game', query: 'seed=1&speed=1', seconds: 34,
    setup: MUSIC_SETUP,
    actions: [
      ...Array.from({ length: 34 }, (_, i) => ({ at: i + 0.5, js: CLICK('Onward') })),
      ...Array.from({ length: 30 }, (_, i) => ({ at: i + 1, js: `(() => { const H = window.__HITL; const d = H.state.pendingDecision; if (!d) return; window.__decisionSeen ??= performance.now(); if (performance.now() - window.__decisionSeen > 3000) { H.dispatch({ type: 'resolveDecision', choice: 0 }); window.__decisionSeen = undefined; } })()` })),
    ],
    screenshots: [10, 16, 22, 28],
  },
  {
    // The real sim's Waffle Party, staged by the sim so the next live week awards it.
    id: '5-4-waffle-party-real', title: '5.4 Waffle Party in a real game', query: 'seed=1&speed=1', seconds: 30,
    setup: WAFFLE_SETUP,
    actions: WAFFLE_ACTIONS(30),
    screenshots: [15, 18, 22],
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

  // 6. Sound (record with --audio): one music bed per era and the title, stingers, effects, voices.
  { id: '6-1-music-title', title: '6.1 Music: title', query: '', seconds: 20, sound: true },
  ...['classic', 'chatgbt', 'agents', 'consolidation', 'plateau'].map((era) => ({
    id: `6-1-music-${era}`, title: `6.1 Music: ${era}`, query: 'mock=floor&speed=1', seconds: 20, sound: true, setup: ERA(era),
  })),
  {
    id: '6-1-stingers', title: '6.1 Stingers: launch, era, office, award', query: 'mock=floor&speed=1', seconds: 22, sound: true,
    actions: [
      { at: 1, js: `window.__HITL.emit([{ type: 'launch', productId: window.__HITL.state.products[0].id }])` },
      { at: 4, js: CLICK('Nice!') },
      { at: 7, js: `window.__HITL.emit([{ type: 'era', eraId: 'agents' }])` },
      { at: 10, js: CLICK('Onward') },
      { at: 13, js: `window.__HITL.emit([{ type: 'officeUpgrade', stage: 2 }])` },
      { at: 17, js: `window.__HITL.emit([{ type: 'award', text: 'Saasie for Best Newcomer' }])` },
    ],
  },
  {
    id: '6-2-sfx', title: '6.2 UI and world effects', query: 'mock=floor&speed=1', seconds: 22, sound: true,
    actions: [
      { at: 1, js: KEY('s', 'KeyS') }, { at: 3, js: KEY('Escape') },
      { at: 5, js: `window.__HITL.emit([{ type: 'hire', staffId: window.__HITL.state.staff[0].id }])` },
      { at: 7, js: `window.__HITL.emit([{ type: 'incident', kind: 'bug', productId: window.__HITL.state.products[0].id, caught: true, severity: 2 }])` },
      { at: 9, js: `window.__HITL.emit([{ type: 'incident', kind: 'outage', productId: window.__HITL.state.products[0].id, caught: false, severity: 3 }])` },
      ...[12, 12.4, 12.8].map((at, i) => ({ at, js: `window.__HITL.emit([{ type: 'bubble', staffId: window.__HITL.state.staff[${i + 1}].id, text: '+4 Polish', tone: 'polish' }])` })),
      { at: 15, js: `window.__HITL.emit([{ type: 'toast', text: 'Cash is getting thin', tone: 'warn' }])` },
      { at: 17, js: `window.__HITL.emit([{ type: 'unlock', key: 'research' }])` },
      { at: 20, js: `window.__HITL.emit([{ type: 'goal', goalId: 'first_launch' }])` },
    ],
  },
  {
    id: '6-3-voices', title: '6.3 Voices: spoken lines, a click, a group cheer', query: 'mock=floor&speed=1', seconds: 22, sound: true,
    actions: [
      ...[1, 3.5, 6].map((at, i) => ({ at, js: `(() => { const s = window.__HITL.state; const a = s.staff[${i}], b = s.staff[${i + 1}]; window.__HITL.emit([{ type: 'say', id: 'cap-say-${i}', week: s.week, staffId: a.id, text: ['Did the build pass?', 'It passed. I am suspicious.', 'Ship it before it changes its mind.'][${i}], toId: b.id, replyTo: null }]); })()` })),
      { at: 9, js: `dispatchEvent(new CustomEvent('hitl:characterClick', { detail: { staffId: window.__HITL.state.staff[2].id } }))` },
      { at: 11, js: `dispatchEvent(new CustomEvent('hitl:characterClick', { detail: { staffId: window.__HITL.state.staff[5].id } }))` },
      { at: 14, js: `window.__HITL.emit([{ type: 'launch', productId: window.__HITL.state.products[1].id }])` },
      { at: 19, js: CLICK('Nice!') },
    ],
  },

  // README (group 'readme'): hero stills at 1920x1080 with the UI, from real seeded games so every
  // shot is internally consistent (date, era, effects, goals), plus one short loop.
  // Each nod loads the save from just before the week that raises its decision (pre: the game's own
  // tick raises it, card and freeze as in play); the warm-up skips most of that week, so the card is
  // up a second into the clip. The moment camera follows staged moments; props get a close focus.
  {
    id: 'nods-printer', group: 'nods', title: 'PC LOAD LETTER: the printer taken out back', query: 'seed=1&speed=1', moment: 'printer_jam --stage floor --choice 0', pre: true, seconds: 25, warmup: 6.5,
    setup: BARE,
    actions: [
      { at: 0, js: MARK_MOMENTS }, ...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })),
      ...FOLLOW(['printer_jammed'], 2.4, 0, 25),
      { at: 3.5, js: KEY('1', 'Digit1') },
      ...DISMISS_AT([4, 4.5, 5.5], { escape: false }),
    ],
    screenshots: [2, 14, 20],
  },
  {
    id: 'nods-saturday', group: 'nods', title: 'About Saturday', query: 'seed=1&speed=1', setup: NOD('saturday_ask', 1040) + ';' + BARE, seconds: 7, warmup: 0.5,
    actions: [{ at: 0.05, js: CLEAR_CARDS }, { at: 0.3, js: CLEAR_CARDS }, { at: 4.5, js: KEY('2', 'Digit2') }, ...[4.9, 5.5].map((at) => ({ at, js: CLEAR_CARDS }))],
    screenshots: [3],
  },
  {
    id: 'nods-stapler', group: 'nods', title: 'The red stapler, and the lost and found', query: 'seed=1&speed=1', moment: 'the_stapler', pre: true, seconds: 11, warmup: 6.5,
    setup: BARE,
    actions: [
      ...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })),
      ...[1.5, 2, 2.5, 3].map((at) => ({ at, js: BEST_VIEW(['stapler']) })),
      ...FOLLOW(['stapler'], 3.2, 0, 6),
      { at: 4, js: KEY('1', 'Digit1') },
      ...DISMISS_AT([4.5, 5], { escape: false }),
      { at: 6, js: QUIET_UNTIL_CHAT('lost and found', ['lost and found'], 60) },
      { at: 6.1, js: YAK }, { at: 6.3, js: CLICK_STARTS('#random') },
    ],
    screenshots: [2, 9],
  },
  {
    id: 'nods-cover-sheets', group: 'nods', title: 'TPS reports: the new cover sheets', query: 'seed=1&speed=1', moment: 'cover_sheets', pre: true, seconds: 7, warmup: 6.5,
    setup: BARE,
    actions: [
      ...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })),
      ...[1.5, 2, 2.5, 3].map((at) => ({ at, js: BEST_VIEW(['cover_sheets']) })),
      ...FOLLOW(['cover_sheets'], 3.2, 0, 7),
      { at: 4, js: KEY('1', 'Digit1') },
      ...DISMISS_AT([4.5], { escape: false }),
    ],
    screenshots: [2, 6],
  },
  {
    id: 'nods-consultants', group: 'nods', title: 'The consultants: what would you say you do here?', query: 'seed=1&speed=1', moment: 'efficiency_consultants', pre: true, seconds: 13, warmup: 6.5,
    setup: BARE,
    actions: [...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })), ...FOLLOW(['visitor_chair'], 2.4, 0, 13), { at: 9, js: KEY('2', 'Digit2') }, ...DISMISS_AT([9.5, 10], { escape: false })],
    screenshots: [5, 11],
  },
  {
    id: 'nods-banner', group: 'nods', title: 'Is this good for the company?', query: 'seed=1&speed=1', moment: 'banner_company', pre: true, seconds: 9, warmup: 6.5,
    setup: BARE,
    actions: [
      ...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })),
      ...FOLLOW(['banner_company'], 3, 0, 5),
      { at: 4, js: KEY('1', 'Digit1') },
      ...DISMISS_AT([4.5, 5], { escape: false }),
      ...FOLLOW(['banner_company'], 4, 5, 9),
    ],
    screenshots: [2, 7],
  },

  {
    id: 'readme-garage', group: 'readme', title: 'The garage opening: founders and the first desks', query: 'seed=1&speed=1', still: true,
    setup: PLAY({ weeks: 1 }), warmup: 3,
    // Nothing has been said in Yak yet this early, so the panel is folded away.
    actions: [...DISMISS_AT([0.1, 0.5]), { at: 0.3, js: KEY('c', 'KeyC') }], screenshots: [3],
  },
  {
    // The bot starts more product updates than it staffs; the setup drops the ones nobody is on, so
    // the Needs You tray shows the game rather than the bot. Shot before the first live tick.
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
    // Shot as the winner speaks, before the watching crowd starts its envy emotes.
    id: 'readme-waffle', group: 'readme', title: 'The Waffle Party in a real game', query: 'seed=1&speed=1', still: true,
    setup: WAFFLE_SETUP, actions: WAFFLE_ACTIONS(19), screenshots: [18],
  },
  {
    id: 'readme-loop', group: 'readme', title: 'The office in motion (loop)', query: 'seed=1&speed=1&time=day', seconds: 7, warmup: 6, hideUi: true,
    setup: PLAY({ weeks: 500, until: "s.office.stage === 2 && s.era.id === 'agents'", after: IN_OFFICE }),
  },
];
