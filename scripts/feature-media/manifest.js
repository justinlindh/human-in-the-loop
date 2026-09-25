import {
  PLAY, PRE_UNTIL, PRE_DECISION, IN_OFFICE, DROP_UNSTAFFED, STAFF_IDLE, INCIDENT_ON_FLOOR, CHAT_HISTORY,
  BARE, CLEAN, STAGE_ONLY, YAK_ONLY, NO_CARD, CLEAR_CARDS, CLEAR_EARLY, DISMISS_AT, CHOOSE_WHEN, CLICK, CLICK_SEL, KEY,
  FOLLOW, SEATED, BEST_VIEW, CAMLOG, WAFFLE_SETUP, WAFFLE_ACTIONS, MARK_MOMENTS, NO_SAY,
} from '../capture-manifest.js';

// Feature media: capture.js items (see scripts/capture-manifest.js for the item fields) with the files
// to make from each recording (`out`, see scripts/feature-media/render.mjs). Paths mirror where the files are
// used: img/ and media/ are the landing page's (humanintheloopgame-site), so a render drops straight
// into a checkout of it.
// Every shot plays through the real game loop: a bot plays a real game to the week before the moment
// (PRE_UNTIL, or an indexed moment with pre), and the game's own tick brings it live, card, freeze and
// staging as in play. Cards are answered by key. The camera glides (FOLLOW) or holds; clips log it
// every frame (CAMLOG) for scripts/reels/camstats.mjs.

// The HQ in the Agents era.
const HQ = "s.office.stage === 2 && s.era.id === 'agents'";
const STILL = (name, from, crop) => ({ path: `img/${name}.webp`, size: '1280x720', from, crop });
// A 1280x720 loop with a 1280x720 poster, as the landing page's event loops are.
const LOOP = (name, from, seconds, crop, crf) => ({ path: `media/loops/${name}.mp4`, size: '1280x720', from, seconds, webm: true, poster: `img/loops/${name}.webp`, crop, ...(crf ? { crf, webmCrf: crf + 12 } : {}) });
// The middle two thirds of the frame: a 1280x720 window of a 1920x1080 recording, at native pixels.
const MIDDLE = { x: 1 / 6, y: 1 / 6, w: 2 / 3, h: 2 / 3 };
// The opening seconds of a staged nod: queued cards closed, and the view turned to see the prop.
const OPEN = (props) => [...[0, 0.5, 1, 1.5].map((at) => ({ at, js: CLEAR_CARDS })), ...(props ? [1.5, 2, 2.5, 3].map((at) => ({ at, js: BEST_VIEW(props) })) : [])];
// Everything in the office and nothing over it, from a real game played until `until`.
const OFFICE = (weeks, until, time = 'day') => ({
  query: `seed=1&speed=1&time=${time}`, warmup: 6,
  setup: `(async () => { await ${PLAY({ weeks, until, after: IN_OFFICE })}; ${STAGE_ONLY}; })()`,
});

// The growth timelapse (eras section): one company, seed 5, grown by the balanced bot and then, from
// Consolidation, run by the automate-everything bot, so headcount peaks at HQ and falls in the
// Plateau. Each stage is the game played to `week`, then shown live with nothing over the office.
const GROWTH_STAGES = [['garage', 6, 'Classic'], ['floor', 138, 'Classic'], ['floor-full', 262, 'ChatGBT'], ['hq', 700, 'Consolidation'], ['late', 780, 'Plateau']];
// Where the camera looks at the start: the stage's own fitted view.
const VIEW0 = { js: '(window.__view0 ??= window.__hitlRender.view())' };
// The people's centre, for a tighter frame on a filled room.
const PEOPLE = { js: "(() => { let n = 0, x = 0, z = 0; window.__hitlRender.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); return window.__people ??= (n ? { x: x / n, z: z / n } : null); })()" };
const GROWTH_CAMERA = {
  'floor-full': [{ at: 0, target: PEOPLE, zoom: 1.7 }],
  late: [{ at: 0, target: VIEW0, zoom: 1.25 }, { at: 1, target: VIEW0, zoom: 1.25 }, { at: 5.5, target: [-1.6, -4.1], zoom: 2.5, ease: 'inOut' }],
};
const GROW = (week) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  while (s.week < ${week} && !s.gameOver) {
    const bot = s.era.id === 'consolidation' || s.era.id === 'plateau' ? 'automateAll' : 'balanced';
    b.botDecide(bot, s); b.botTurn(bot, s); sim.tick(s);
  }
  b.botDecide(s.era.id === 'consolidation' || s.era.id === 'plateau' ? 'automateAll' : 'balanced', s);
  ${IN_OFFICE}
  ${STAGE_ONLY};
})()`;

// Seed 4 grown by the balanced bot until the Agents era at the Office Floor or HQ, then run by the
// automate-everything bot; stops the week before the runaway cloud bill (tested on a copy ticked ahead).
const RUNAWAY = `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  for (let i = 0; i < 700 && !s.gameOver; i++) {
    const bot = !['classic', 'chatgbt'].includes(s.era.id) && s.office.stage >= 1 ? 'automateAll' : 'balanced';
    b.botDecide(bot, s); b.botTurn(bot, s);
    const ahead = structuredClone(s); sim.tick(ahead);
    if (ahead.pendingDecision?.eventId === 'agent_runaway_spend') break;
    sim.tick(s);
  }
})()`;

// For FOLLOW: the centre of a staged prop's bounds, for a prop drawn away from its origin (on a wall).
const BOX = (prop) => `() => { const R = window.__hitlRender, T = R.THREE; const o = R.props.current().find((x) => x.prop === '${prop}')?.obj; return o ? new T.Box3().setFromObject(o).getCenter(new T.Vector3()) : null; }`;

// A point offset from the staff's centre (found once per clip), for the hero's drift.
const HERO_AT = (dx, dz) => ({ js: `(() => { const c = window.__heroC ??= (() => { let n = 0, x = 0, z = 0; window.__hitlRender.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); return n ? { x: x / n, z: z / n } : null; })(); return c && { x: c.x + ${dx}, z: c.z + ${dz} }; })()` });

export const ITEMS = [
  // The office, by stage and time.
  {
    // The hero: recorded at 4K with the tilt-shift off, so it stays crisp on large and HiDPI screens.
    // The camera drifts across the staff's centre and back along an eased path, so the loop's two
    // ends frame the same and the join shows no ghost. The still is taken from it.
    id: 'site-hero', title: 'Landing page hero: the HQ by day, and a drift over it', ...OFFICE(500, HQ), seconds: 14.5, record: '3840x2160',
    camera: [{ at: 0, target: HERO_AT(-1.8, 0.9), zoom: 1.2 }, { at: 7, target: HERO_AT(1.8, -0.9), zoom: 1.2, ease: 'inOut' }, { at: 14, target: HERO_AT(-1.8, 0.9), zoom: 1.2, ease: 'inOut' }],
    actions: [{ at: 0, js: 'window.__hitlRender.setTiltShift(false)' }, ...CLEAR_EARLY, ...CAMLOG(14.5)],
    screenshots: [3.5],
    out: [
      { path: 'img/hero.webp', size: '1920x1080', from: 3.5, quality: 88 },
      { path: 'img/hero-2560.webp', size: '2560x1440', from: 3.5, quality: 86 },
      { path: 'media/loops/hero.mp4', size: '1600x900', from: 0, seconds: 14, fps: 24, webm: true, xfade: 0.4, crf: 30, webmCrf: 40 },
      { path: 'media/loops/hero-2560.mp4', size: '2560x1440', from: 0, seconds: 14, fps: 24, webm: true, xfade: 0.4, crf: 31, webmCrf: 42 },
    ],
  },
  {
    id: 'site-hq-night', title: 'Landing page: the HQ at night', ...OFFICE(500, HQ, 'night'), still: true,
    actions: CLEAR_EARLY, screenshots: [4],
    out: [{ path: 'img/hq-night.webp', size: '1600x900' }],
  },
  {
    id: 'site-floor', title: 'Landing page: the Office Floor', ...OFFICE(400, 's.office.stage === 1 && s.staff.length >= 12'), still: true,
    actions: CLEAR_EARLY, screenshots: [4],
    out: [{ path: 'img/floor.webp', size: '1600x900' }],
  },
  {
    id: 'site-garage', title: 'Landing page: the garage, two founders at their first desks', ...OFFICE(2, 'false'), warmup: 4, still: true,
    actions: CLEAR_EARLY, screenshots: [4],
    out: [{ path: 'img/garage.webp', size: '1600x900' }],
  },
  {
    id: 'site-lockdown', title: 'Landing page: lockdown, the call over the empty office', query: 'seed=1&speed=1', warmup: 1, still: true,
    setup: `(async () => { await ${PLAY({ weeks: 200, until: 's.lockdown', after: CHAT_HISTORY })}; ${BARE}; })()`,
    actions: [...DISMISS_AT([0.1, 1, 2, 3, 4, 5, 6, 7, 8, 9]), ...CHOOSE_WHEN(null, 0, 1, 10, 2)], screenshots: [10],
    out: [{ path: 'img/lockdown.webp', size: '1920x1080' }],
  },
  {
    // The live week launches the first product; a decision raised the same week is answered first.
    // The results card then waits out the UI's spacing after the last card (about 30 s of play).
    id: 'site-launch', title: 'Landing page: launch day reviews', query: 'seed=33&speed=1', warmup: 0.5, still: true,
    setup: `(async () => { await ${PRE_UNTIL({ weeks: 120, bot: 'balanced', hit: "(c, ev) => ev.some((e) => e.type === 'launch')" })}; ${BARE}; })()`,
    actions: [...DISMISS_AT([0.1, 0.6, 1.5, 3, 4, 5, 6, 8, 10], { escape: false }), ...CHOOSE_WHEN(null, 0, 1, 20, 2)],
    screenshots: [44],
    out: [{ path: 'img/launch.webp', size: '1920x1080', crop: { x: 0.2083, y: 0.2269, w: 0.5833, h: 0.5833 } }],
  },

  // Event loops: the office in motion, no side panels.
  {
    // The week before an era turns, from the index: the office redresses itself live. The era card is
    // hidden so the redress shows.
    id: 'site-loop-era', title: 'Landing page loop: an era arrives', query: 'seed=1&speed=1', moment: 'era --era agents --stage floor --snapshot', seconds: 16, warmup: 0.5,
    setup: `(() => { ${CLEAN}; document.getElementById('clean-shot').textContent += ' #ui .announce-back.docked { display: none !important; }'; })()`,
    actions: [...DISMISS_AT([2, 3, 4, 5, 6, 8, 10], { escape: false }), ...CAMLOG(16)], screenshots: [4, 8, 12],
    out: [LOOP('era', 5, 6.1)],
  },
  {
    // A real incident on the Office Floor: the alarm, and the nearest people run to the servers. A
    // decision the same week freezes the office, so it is answered quickly.
    id: 'site-loop-incident', title: 'Landing page loop: an incident', query: 'seed=2&speed=1', seconds: 16, warmup: 0.5,
    setup: `(async () => { await ${PRE_UNTIL({ weeks: 500, hit: INCIDENT_ON_FLOOR, prep: IN_OFFICE })}; ${CLEAN}; })()`,
    actions: [...CLEAR_EARLY, ...DISMISS_AT([3, 5, 7, 9, 11, 13], { escape: false }), ...CHOOSE_WHEN(null, 1, 1, 16, 0.5), ...CAMLOG(16)],
    screenshots: [8, 10, 12],
    out: [LOOP('incident', 8.8, 7)],
  },
  {
    id: 'site-loop-waffle', title: 'Landing page loop: the Waffle Party', query: 'seed=1&speed=1', seconds: 30,
    setup: `(async () => { await ${WAFFLE_SETUP}; ${CLEAN}; })()`, actions: [{ at: 0, js: NO_SAY }, ...WAFFLE_ACTIONS(30), ...CAMLOG(30)], screenshots: [12, 16, 20, 24],
    out: [LOOP('waffle', 16, 4.2, MIDDLE, 28)],
  },
  {
    // Music night is made the next reward, and the live week raises its genre decision; the first
    // genre is picked by key and the dance break plays.
    id: 'site-loop-music', title: 'Landing page loop: music night', query: 'seed=1&speed=1', seconds: 40, warmup: 0.5,
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} sim.stageIncentive(s, 'music_night');` })}; await ${PRE_DECISION('music_night_genre', 16)}; ${CLEAN}; })()`,
    actions: [{ at: 0, js: NO_SAY }, ...CLEAR_EARLY, ...CHOOSE_WHEN('music_night_genre', 0, 1, 20, 3), ...Array.from({ length: 36 }, (_, i) => ({ at: i + 4.5, js: CLICK('Onward') })), ...CAMLOG(40)],
    screenshots: [16, 20, 24, 28],
    out: [LOOP('music', 19, 4.2, MIDDLE, 30)],
  },
  {
    // Every monitor shows the ransom skull while the decision is open; the office holds still under
    // the card, so the camera sits on one person at their desk. The window keeps the card out.
    id: 'site-loop-ransomware', title: 'Landing page loop: ransomware on every screen', query: 'seed=9&speed=1', moment: 'ransomware --stage floor --choice 0', pre: true, seconds: 14, warmup: 6.5,
    setup: BARE, actions: [...FOLLOW(SEATED, 3.2, 0, 14, -320), ...CAMLOG(14)], screenshots: [3, 6, 9],
    out: [LOOP('ransomware', 5, 4.2, { x: 0, y: 1 / 6, w: 2 / 3, h: 2 / 3 }, 27)],
  },

  {
    // Automate it, and live with it: seed 4 grows to an Agents-era HQ with the balanced bot, then the
    // automate-everything bot runs it until the live week raises the runaway cloud bill. The office
    // holds still under the card (the bill), so the camera pushes in on the hot rack.
    id: 'site-loop-automation', title: 'Landing page loop: the runaway cloud bill and the hot rack', query: 'seed=4&speed=1', seconds: 22, warmup: 0.5,
    setup: `(async () => { await ${RUNAWAY}; ${BARE}; })()`,
    actions: [...CLEAR_EARLY, { at: 0, js: MARK_MOMENTS }, ...FOLLOW(BOX('rack_hot'), 2.8, 0, 22), ...CAMLOG(22)],
    screenshots: [10, 14, 18],
    out: [LOOP('automation', 10, 9)],
  },

  // New on the page: Yak, the Office Space nods, and decisions you can see.
  {
    // A meme posted mid-outage backfires: 😬 reactions and the team's replies under it, in #random.
    // The large Yak keeps the game running (the maximised one pauses it).
    id: 'site-yak-backfire', title: 'Landing page: a meme mid-outage, and the replies', query: 'seed=2&speed=1', warmup: 0.5, still: true,
    setup: `(async () => { await ${PRE_UNTIL({ weeks: 600, prep: IN_OFFICE, after: CHAT_HISTORY, hit: '(c) => c.office.stage === 1 && c.outage?.weeks === 0' })}; ${YAK_ONLY}; })()`,
    actions: [
      ...CLEAR_EARLY, ...DISMISS_AT([4, 5, 6, 12, 18, 24], { escape: false }), ...CHOOSE_WHEN(null, 0, 1, 34, 1),
      { at: 9.5, js: CLICK_SEL('.chat.yak .ysz[aria-label="large size"]') },
      { at: 10, js: CLICK_SEL('.ypost-btn') },
      { at: 11, js: `[...document.querySelectorAll('.ypost-opt')].find((b) => b.getClientRects().length && /meme/i.test(b.textContent))?.click()` },
      ...[11.5, 16, 22, 28, 32].map((at) => ({ at, js: `[...document.querySelectorAll('.chat.yak button')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith('#random'))?.click()` })),
      // Newer messages push the thread up: scroll it back to the top of the list for the frame.
      { at: 32.5, js: `(() => { const posts = [...document.querySelectorAll('.chat.yak *')].filter((e) => e.children.length === 0 && /prod is back/.test(e.textContent)); posts[0]?.scrollIntoView({ block: 'center' }); })()` },
    ],
    screenshots: [14, 20, 26, 33],
    out: [{ path: 'img/yak-backfire.webp', size: '1280x720', from: 33, crop: { x: 0, y: 1 / 3, w: 2 / 3, h: 2 / 3 } }],
  },
  {
    id: 'site-printer', title: 'Landing page loop: the printer taken out back', query: 'seed=1&speed=1', moment: 'printer_jam --stage floor --choice 0', pre: true, seconds: 25, warmup: 6.5,
    setup: CLEAN,
    actions: [{ at: 0, js: NO_SAY }, ...OPEN(), ...FOLLOW(['printer_jammed'], 2.4, 0, 25), { at: 3.5, js: KEY('1', 'Digit1') }, ...DISMISS_AT([4, 4.5, 5.5], { escape: false }), ...CAMLOG(25)],
    screenshots: [17, 20],
    out: [LOOP('printer', 17.5, 6, MIDDLE)],
  },
  {
    // "Let them keep it" leaves the stapler on the desk. Recorded at 4K for a native crop.
    id: 'site-stapler', title: 'Landing page: the red stapler', query: 'seed=1&speed=1', moment: 'the_stapler', pre: true, warmup: 6.5, still: true, record: '3840x2160',
    setup: CLEAN,
    actions: [...OPEN(['stapler']), ...FOLLOW(['stapler'], 3.2, 0, 9), { at: 4, js: KEY('2', 'Digit2') }, ...DISMISS_AT([4.5, 5], { escape: false })],
    screenshots: [8],
    out: [STILL('stapler', 8, { x: 0.4297, y: 0.4069, w: 0.15, h: 0.15 })],
  },
  {
    // Both choices clear the stack, so it is shot while the decision is open, the card hidden.
    id: 'site-cover-sheets', title: 'Landing page: the TPS cover sheets', query: 'seed=1&speed=1', moment: 'cover_sheets', pre: true, warmup: 6.5, still: true, record: '3840x2160',
    setup: `(() => { ${CLEAN}; ${NO_CARD}; })()`,
    actions: [...OPEN(['cover_sheets']), ...FOLLOW(['cover_sheets'], 3.2, 0, 5)],
    screenshots: [4.5],
    out: [STILL('cover-sheets', 4.5, { x: 0.3917, y: 0.4125, w: 0.2083, h: 0.2083 })],
  },
  {
    // "Rise above it" hangs the sign; the live week raises the jab.
    id: 'site-rival-sign', title: 'Landing page: days since they copied us', query: 'seed=1&speed=1', warmup: 0.5, still: true, record: '3840x2160',
    setup: `(async () => { await ${PRE_DECISION('rival_jab', 600, 'c.office.stage >= 1')}; ${CLEAN}; })()`,
    actions: [...CLEAR_EARLY, ...CHOOSE_WHEN('rival_jab', 0, 1, 14), ...DISMISS_AT([12, 13], { escape: false }), ...FOLLOW(['sign_rival_copied'], 3.2, 0, 20)],
    screenshots: [14],
    out: [STILL('rival-sign', 14, { x: 0.2917, y: 0.2315, w: 0.4167, h: 0.4167 })],
  },
  {
    // "Sponsor a prize" hangs the cheque; the live week raises the hackathon.
    id: 'site-cheque', title: 'Landing page: the giant novelty cheque', query: 'seed=1&speed=1', warmup: 0.5, still: true, record: '3840x2160',
    setup: `(async () => { await ${PRE_DECISION('ai_summit_hackathon', 600)}; ${CLEAN}; })()`,
    actions: [...CLEAR_EARLY, ...CHOOSE_WHEN('ai_summit_hackathon', 1, 1, 14), ...DISMISS_AT([12, 13, 14, 15], { escape: false }), ...FOLLOW(['giant_cheque'], 3.2, 0, 20)],
    screenshots: [17],
    out: [STILL('cheque', 17, { x: 0.3698, y: 0.2454, w: 0.25, h: 0.25 })],
  },
  {
    // Shot while the pivot is open, the card hidden.
    id: 'site-whiteboard', title: 'Landing page: the whiteboard, the market has spoken', query: 'seed=1&speed=1', moment: 'pivot_pitch --stage floor', pre: true, warmup: 6.5, still: true, record: '3840x2160',
    setup: `(() => { ${CLEAN}; ${NO_CARD}; })()`,
    actions: [...OPEN(['whiteboard_scrawl']), ...FOLLOW(['whiteboard_scrawl'], 3.2, 0, 5)],
    screenshots: [4.5],
    out: [STILL('whiteboard', 4.5, { x: 0.2917, y: 0.2917, w: 0.4167, h: 0.4167 })],
  },
  {
    // "Watch in silence": the founders flinch together behind the visitor.
    id: 'site-visitor', title: 'Landing page loop: the first user test, the founders hiding', query: 'seed=1&speed=1', moment: 'first_user_test', pre: true, seconds: 16, warmup: 6.5,
    setup: BARE,
    actions: [{ at: 0, js: NO_SAY }, ...OPEN(), ...FOLLOW(['visitor_chair'], 3, 0, 16), { at: 5, js: KEY('1', 'Digit1') }, ...DISMISS_AT([5.5, 6], { escape: false }), ...CAMLOG(16)],
    screenshots: [7],
    out: [LOOP('visitor', 5, 6, { x: 0.1354, y: 0.0926, w: 2 / 3, h: 2 / 3 }), STILL('visitor', 7, { x: 0.1354, y: 0.0926, w: 2 / 3, h: 2 / 3 })],
  },

  // The growth timelapse, one clip per stage (cut, labelled and joined by scripts/reels/growth.sh). Each
  // records its headcount as a mark. The filled floor frames a little tighter on the people; the late
  // HQ pushes in from the wide view onto its row of empty desks.
  ...GROWTH_STAGES.map(([name, week, era]) => ({
    id: `growth-${name}`, title: `Growth timelapse: ${name}, ${era} (week ${week})`, query: 'seed=5&speed=1&time=day', seconds: 6, warmup: 3,
    setup: GROW(week),
    actions: [...CLEAR_EARLY, ...CHOOSE_WHEN(null, 0, 1, 6, 1), ...CAMLOG(6),
      { at: 0.5, js: `(() => { const s = window.__HITL.state; (window.__captureMarks ??= []).push({ t: 0, label: 'headcount ' + s.staff.filter((p) => p.mood !== 'away').length + ' era ${era}' }); })()` }],
    ...(GROWTH_CAMERA[name] ? { camera: GROWTH_CAMERA[name] } : {}),
    screenshots: [2, 5.5],
  })),
];
