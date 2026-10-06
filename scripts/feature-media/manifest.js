import { YAK_HELPERS, YAK_CHECK } from './yak.js';
import {
  PLAY, PRE_UNTIL, PRE_DECISION, IN_OFFICE, DROP_UNSTAFFED, STAFF_IDLE, INCIDENT_ON_FLOOR, CHAT_HISTORY,
  BARE, CLEAN, STAGE_ONLY, YAK_ONLY, NO_CARD, CLEAR_CARDS, CLEAR_EARLY, DISMISS_AT, CHOOSE_WHEN, CLICK, CLICK_SEL, CLICK_STARTS, KEY,
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
// The middle of the largest group of empty desks (desks with nobody seated within 1.2 m), found once,
// for a push-in that shows who's gone. Desk and seat positions come from their screen boxes projected
// onto the floor.
export const EMPTY_DESKS = { js: `(window.__emptyAt ??= (() => {
  const R = window.__hitlRender, T = R.THREE, s = window.__HITL.state, cam = R.camera, ray = new T.Raycaster(), floor = new T.Plane(new T.Vector3(0, 1, 0), 0);
  const ground = (r) => { if (!r) return null; ray.setFromCamera(new T.Vector2(((r.left + r.width / 2) / innerWidth) * 2 - 1, -(((r.top + r.height * 0.7) / innerHeight) * 2 - 1)), cam); const p = new T.Vector3(); return ray.ray.intersectPlane(floor, p) ? p : null; };
  const people = s.staff.map((p) => ground(R.screenRectOf({ kind: 'staff', id: p.id }))).filter(Boolean);
  const empty = s.office.placed.filter((i) => i.itemId === 'desk').map((i) => ground(R.screenRectOf({ kind: 'item', id: i.id }))).filter((d) => d && !people.some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 1.2));
  if (!empty.length) return undefined;
  const near = (d) => empty.filter((e) => Math.hypot(e.x - d.x, e.z - d.z) < 2.5);
  const best = empty.reduce((a, d) => (near(d).length > near(a).length ? d : a));
  const g = near(best); return { x: g.reduce((t, d) => t + d.x, 0) / g.length, z: g.reduce((t, d) => t + d.z, 0) / g.length };
})())` };
const GROWTH_CAMERA = {
  'floor-full': [{ at: 0, target: PEOPLE, zoom: 1.7 }],
  late: [{ at: 0, target: VIEW0, zoom: 1.25 }, { at: 1, target: VIEW0, zoom: 1.25 }, { at: 5.5, target: [-1.6, -4.1], zoom: 2.5, ease: 'inOut' }],
};
// lateHires: false plays the late eras without hiring, so attrition thins the office out.
export const GROW = (week, { lateHires = true } = {}) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  while (s.week < ${week} && !s.gameOver) {
    const late = s.era.id === 'consolidation' || s.era.id === 'plateau';
    const bot = late ? 'automateAll' : 'balanced';
    const hold = late && ${!lateHires} ? s.candidates : null;
    if (hold) s.candidates = [];
    b.botDecide(bot, s); b.botTurn(bot, s);
    if (hold) s.candidates = hold;
    sim.tick(s);
  }
  b.botDecide(s.era.id === 'consolidation' || s.era.id === 'plateau' ? 'automateAll' : 'balanced', s);
  ${IN_OFFICE}
  ${STAGE_ONLY};
})()`;

// A seeded game grown by the balanced bot until the Agents era at the Office Floor or HQ, then run by the
// automate-everything bot; stops the week before the runaway cloud bill (tested on a copy ticked ahead).
export const RUNAWAY = `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  let found = false;
  for (let i = 0; i < 700 && !s.gameOver; i++) {
    const bot = !['classic', 'chatgbt'].includes(s.era.id) && s.office.stage >= 1 ? 'automateAll' : 'balanced';
    b.botDecide(bot, s); b.botTurn(bot, s);
    const ahead = structuredClone(s); sim.tick(ahead);
    if (!ahead.gameOver && ahead.pendingDecision?.eventId === 'agent_runaway_spend' && ahead.pendingDecision.stage?.prop === 'rack_hot') { found = true; break; }
    sim.tick(s);
  }
  if (!found || s.gameOver) throw new Error('capture: no live runaway cloud bill found');
})()`;

// For FOLLOW: the centre of a staged prop's bounds, for a prop drawn away from its origin (on a wall).
const BOX = (prop) => `() => { const R = window.__hitlRender, T = R.THREE; const o = R.props.current().find((x) => x.prop === '${prop}')?.obj; return o ? new T.Box3().setFromObject(o).getCenter(new T.Vector3()) : null; }`;

// A point offset from the staff's centre (found once per clip), for the hero's drift.
const HERO_AT = (dx, dz) => ({ js: `(() => { const c = window.__heroC ??= (() => { let n = 0, x = 0, z = 0; window.__hitlRender.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); return n ? { x: x / n, z: z / n } : null; })(); return c && { x: c.x + ${dx}, z: c.z + ${dz} }; })()` });

// The decision card moved in from the screen's right edge and up, so a crop keeps a margin round
// it and the page's corner controls don't cover it.
const CARD_IN = `(() => { const st = document.createElement('style'); st.textContent = '#ui .modal.decision { translate: -180px -120px; }'; document.head.append(st); })();`;

// [name, event id and index filters, prop to follow, choice index to make, follow zoom (none: the game's
// wide view, for scenes on every screen)]. The big offices need a closer zoom than the garage.
const MOMENTS = [
  ['pizza', 'hackathon_week --stage floor --choice 0', 'pizza_boxes', 0, 2.8],
  // The all-hands screen on its floor stand: the camera holds on it, where the hammer goes through.
  ['hammer', 'open_plan_office --seed 10 --choice 0', '() => ({ x: -9.8, z: -6.25 })', 0, 3, 22],
  ['carrier', 'cat_request --choice 0', 'pet_carrier', 0, 2.8],
  // No follow zoom: the game's own moment camera frames these (it zooms further in the bigger offices).
  ['consultants', 'efficiency_consultants --seed 1 --choice 1', 'visitor_chair', 1],
  ['letter', 'hearing_summons --seed 1 --choice 0', 'envelope_thick', 0],
  // "Live with it" (the third answer) keeps the smoke up for 12 s after the card closes, so the fanning plays in it.
  ['fumes', 'coffee_machine_broke --stage floor --seed 2 --choice 0', '() => ({ x: -2.5, z: -5.5 })', 2, 3, 17],
  ['bridge-loan', 'bridge_loan --choice 0', 'screens_red', 0],
  ['ransomware', 'ransomware --stage garage --choice 0', 'screens_skull', 0],
  ['printer', 'printer_jam --stage floor --choice 0', 'printer_jammed', 0, 2.6, 27],
  ['user-test', 'first_user_test --choice 1', 'visitor_chair', 1, 2.6],
  ['banner', 'banner_company --choice 1', 'banner_company', 0, 3.2],
  ['the-box', 'the_box --choice 1', 'box_poster', 0, 3.2],
  ['incubator', 'incubator_house --choice 0', 'house_sign', 0, 2.6],
];

// Moments the event index reaches in too few games to rely on: each is staged from a real game by scheduling its
// decision for the next week, so the game's own tick raises it with its card, freeze and staging.
const SCHEDULED = (eventId, weeks) => `${PLAY({ weeks, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} s.scheduled.push({ id: 'sch_pin', week: s.week + 1, kind: 'event', payload: { eventId: '${eventId}', subjectId: null } });` })}; await ${PRE_DECISION(eventId, 12)}`;
// Notes the pinned decision when it is on screen, and fails the item at `at` if it never was.
const SEEN_GUARD = (eventId, length) => [
  ...Array.from({ length: 2 * length - 4 }, (_, i) => ({ at: 0.5 + i / 2, js: `(() => { if (window.__HITL.state.pendingDecision?.eventId === '${eventId}') window.__pinSeen = true; })()` })),
  { at: length - 1.5, js: `(() => { if (!window.__pinSeen) console.error('capture: the ${eventId} decision never opened'); })()` },
];
// Yak prompts the index reaches too rarely: a real game played into the situation that raises them (the weeks of
// low cash are held up each week while the look-ahead runs), stopping the week before the prompt opens.
const PINNED_PROMPTS = {
  lowcash_lunch: `${PLAY({ weeks: 100, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE}` })}; await ${PRE_UNTIL({ weeks: 16, prep: 's.cash = Math.min(s.cash, -1e6); s.lowCashWeeks = Math.max(s.lowCashWeeks, 1);', hit: `(c) => (c.chatPrompts ?? []).some((p) => p.kind === 'lowcash_lunch' && !p.resolved)` })}`,
};
const PINNED_EVENT = { 'bridge-loan': 'bridge_loan' };
const PINNED_MOMENTS = { 'bridge-loan': SCHEDULED('bridge_loan', 176) };

// [event id, find.js query, staged prop, follow zoom]: the staged decisions of docs/features/decisions.md.
const DECISION_PROPS = [
  ['hackathon', 'hackathon --choice 0', 'pizza_boxes'],
  ['team_offsite', 'team_offsite --choice 0', 'brochure'],
  ['no_show', 'no_show --choice 0', 'sticky_notes'],
  ['junior_overwhelmed', 'junior_overwhelmed --choice 0', 'sticky_notes'],
  ['pivot_pitch', 'pivot_pitch --choice 1', 'whiteboard_scrawl'],
  ['founder_burnout', 'founder_burnout --choice 0', 'mug_pile'],
  ['enterprise_rfp', 'enterprise_rfp --choice 0', 'binder'],
  ['onprem_bank', 'onprem_bank --choice 0', 'binder'],
  ['phishing_ceo', 'phishing_ceo --choice 1', 'gift_cards'],
  ['pet_mishap', 'pet_mishap --choice 0', 'cable_chewed'],
  ['cloud_bill', 'cloud_bill --choice 0', 'invoice', 5.5, true],
  ['floor_next_door', 'floor_next_door --choice 0', 'tape_measure'],
  ['mission_test_support', 'mission_test_support --choice 0', 'printout', 5.5, true],
  ['moonshot_pitch', 'moonshot_pitch --choice 1', 'printout', 5.5, true],
  ['conference_expo', 'conference_expo --choice 1', 'printout', 5.5, true],
  ['ping_pong', 'ping_pong --choice 1', 'picture_pingpong', 5.5, true],
  // Props a choice leaves behind, opened at the week before the decision.
  ['rival_jab', 'rival_jab', 'sign_rival_copied', 5.5, true],
  ['alumni_reunion', 'alumni_reunion', 'old_sign', 5.5, true],
  ['mission_statement', 'mission_statement', 'mug_typo', 5.5, true],
  ['ai_summit_hackathon', 'ai_summit_hackathon', 'giant_cheque', 5.5, true],
  ['last_bet', 'last_bet', 'whiteboard_scrawl', 5.5, true],
];

// The Yak reply prompt kinds of docs/features/yak.md (src/data/prompts.js).
const YAK_PROMPTS = ['strain_vent', 'incident_blame', 'launch_hype', 'rival_itch', 'project_late', 'agent_prs', 'newhire_lost', 'coasting_check', 'support_swamped', 'lowcash_lunch', 'desk_squeeze', 'office_full', 'junior_pr'];

// Decisions whose prop appears when a choice is made, not while the card is open.
// Each maps to the choice that leaves the prop; the moment is opened without a choice, since the save is
// from before the decision and the clip answers it.
const LEFT_BEHIND = new Map([['rival_jab', 0], ['alumni_reunion', 0], ['mission_statement', 0], ['ai_summit_hackathon', 1], ['last_bet', 0]]);

// Decisions whose prop is still too small to read at the closest zoom; they render but do not publish.
const UNREADABLE_DECISIONS = new Set(['no_show', 'junior_overwhelmed', 'founder_burnout', 'enterprise_rfp', 'phishing_ceo', 'alumni_reunion']);

// [item id, camera zoom, era the item needs] of the shop items shown in docs/features/office.md.
const ITEM_STILLS = [
  ['disk_duplicator', 3.2, 'preinternet'], ['retail_shelf', 3.2, 'preinternet'], ['dotcom_banner', 3.2, 'dotcom'],
  ['desk'], ['meeting_table'], ['whiteboard'], ['coffee_corner'], ['plant'], ['bookshelf'], ['couch'], ['foosball'], ['ping_pong_table'],
  ['espresso'], ['plant_wall'], ['nap_pod'], ['arcade'], ['standing_desk'], ['whiteboard_wall'], ['library'], ['monitoring_wall'], ['noc'],
  ['office_robot'], ['server_rack'], ['trophy_case'],
];

// A real game played to week 176 with the Incentives Program on and the ladder set to `reward`'s rung, then
// advanced to the week before the award (found by ticking a copy ahead): the first live week awards it.
const RUNG = (reward) => PLAY({ weeks: 176, after: `${IN_OFFICE}${CHAT_HISTORY}${DROP_UNSTAFFED}${STAFF_IDLE}
  s.policies.incentives = true;
  const { INCENTIVES } = await import('/src/data/incentives.js');
  s.flags.incentiveCount = window.__rung = INCENTIVES.filter((r) => r.id !== 'waffle_party').findIndex((r) => r.id === '${reward}');
  s.flags.incentiveWeek = s.week - (await import('/src/sim/balance.js')).B.incentiveEveryWeeks;
  const ahead = structuredClone(s); let weeks = 0, found = false;
  while (weeks < 12 && !found) { weeks++; const ev = sim.tick(ahead) ?? []; const hit = ev.find((e) => e.type === 'incentive' && e.reward === '${reward}'); found = !!hit; if (hit) window.__winner = hit.staffId; else b.botDecide('balanced', ahead); }
  if (!found) throw new Error('capture: no ${reward} award within 12 weeks');
  for (let i = 1; i < weeks; i++) { sim.tick(s); b.botDecide('balanced', s); }` });

// The world point of the person an incentive was staged for (window.__winner), for FOLLOW.
const WINNER = `() => { const R = window.__hitlRender; let o = null; R.scene.traverse((x) => { if (!o && x.userData.staffId === window.__winner) o = x.parent; }); return o ? o.getWorldPosition(new o.position.constructor()) : null; }`;

// The framed caricature the award hangs on the wall (its world point is kept in userData.at), for FOLLOW.
const CARICATURE = `() => { const R = window.__hitlRender; let g = null; R.scene.traverse((x) => { if (!g && x.userData.at && x.userData.at.y > 1) g = x; }); if (!g) return null;
  const w = g.getWorldPosition(new g.position.constructor()), a = g.userData.at; return { x: w.x + a.x, y: w.y + a.y - 0.8, z: w.z + a.z - 1.2 }; }`;

export const ITEMS = [
  // The office, by stage and time.
  {
    // The hero: recorded at 4K with the tilt-shift off, so it stays crisp on large and HiDPI screens.
    // The camera drifts across the staff's centre and back along an eased path, so the loop's two
    // ends frame the same and the join shows no ghost. The still is taken from it.
    id: 'site-hero', title: 'Landing page hero: the HQ by day, and a drift over it', ...OFFICE(500, HQ), seconds: 14.5, record: '3840x2160',
    camera: [{ at: 0, target: HERO_AT(-1.8, 0.9), zoom: 1.2 }, { at: 7, target: HERO_AT(1.8, -0.9), zoom: 1.2, ease: 'inOut' }, { at: 14, target: HERO_AT(-1.8, 0.9), zoom: 1.2, ease: 'inOut' }],
    actions: [{ at: 0, js: 'window.__hitlRender.setTiltShift(false)' }, ...CLEAR_EARLY, ...CAMLOG(14.5)],
    // The stills are cut from the loop's own opening frame (0), not a later one: the site checks the
    // poster against the loop's first frame and refuses a page jump when the loop starts.
    screenshots: [0],
    out: [
      { path: 'img/hero.webp', size: '1920x1080', from: 0, quality: 88 },
      { path: 'img/hero-2560.webp', size: '2560x1440', from: 0, quality: 86 },
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
    out: [{ path: 'img/lockdown.webp', size: '1920x1080', publishAs: 'lockdown' }], publish: true,
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
    id: 'site-loop-era', title: 'Landing page loop: an era arrives', query: 'seed=1&speed=1', moment: 'era --era agents --stage hq --snapshot', seconds: 16, warmup: 0.5,
    setup: `(() => { ${CLEAN}; document.getElementById('clean-shot').textContent += ' #ui .announce-back.docked { display: none !important; }'; })()`,
    actions: [...DISMISS_AT([2, 3, 4, 5, 6, 8, 10], { escape: false }), ...CAMLOG(16)], screenshots: [4, 8, 12],
    out: [LOOP('era', 5, 6.1)],
  },
  {
    // The feature inventory's era arrival: the same moment with the era card kept, so the card, the cheer
    // and the redress all show; the card is closed at 9 s.
    id: 'era-arrival', title: 'Era arrival: the card, then the office redresses', query: 'seed=1&speed=1', moment: 'era --era chatgbt --stage floor --snapshot', seconds: 16, warmup: 0.5,
    setup: `(() => { ${CLEAN}; })()`,
    actions: [...DISMISS_AT([9, 10, 11], { escape: false }), ...CAMLOG(16)], screenshots: [3, 7, 12],
    out: [{ path: 'era-arrival.mp4', size: '1280x720', from: 1, seconds: 13, loop: 'none' }], publish: true,
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
    // A real seed grown to the Office Floor, where there is room for one: bots never buy a meeting
    // table on their own (it is not in their decor list), so this places it the way a player would,
    // then forces daily standups on. The next one gathers everyone round it live.
    id: 'site-loop-meeting', title: 'Landing page loop: a standup round the meeting table', query: 'seed=26&speed=1', seconds: 24, warmup: 0.5,
    setup: `(async () => { await ${PLAY({
      weeks: 300, until: 's.office.stage >= 1 && s.staff.length >= 8',
      after: `${IN_OFFICE}
        { const { suggestPlacement } = await import('/src/sim/office.js');
          if (!s.office.placed.some((p) => p.itemId === 'meeting_table')) { const spot = suggestPlacement(s, 'meeting_table'); if (spot) window.__HITL.dispatch({ type: 'placeItem', itemId: 'meeting_table', x: spot.x, y: spot.y, rot: spot.rot }); } }
        window.__HITL.dispatch({ type: 'setPolicy', id: 'async_standups', on: false });
        window.__HITL.dispatch({ type: 'setPolicy', id: 'daily_standups', on: true });`,
    })}; ${CLEAN}; })()`,
    // The week the table is placed can raise a decision (a poaching offer, say) that holds the office still
    // under its card: answer whichever one it is in the first seconds.
    actions: [...CLEAR_EARLY, ...CHOOSE_WHEN(null, 0, 0.3, 24, 0.4), ...DISMISS_AT([2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18], { escape: false }), ...CAMLOG(24)],
    screenshots: [8.5, 12, 15, 18],
    // People start walking over around 8.5s and are seated by 10s; the dialogue lands by 14s. Cropped
    // on the table (it sits in a back corner, so the full frame reads as mostly empty).
    out: [LOOP('meeting', 8.5, 8, { x: 950 / 1920, y: 300 / 1080, w: 800 / 1920, h: 450 / 1080 })],
  },
  {
    id: 'site-loop-waffle', title: 'Landing page loop: the Waffle Party', query: 'seed=1&speed=1', seconds: 30,
    setup: `(async () => { await ${WAFFLE_SETUP}; ${CLEAN}; })()`, actions: [{ at: 0, js: NO_SAY }, ...WAFFLE_ACTIONS(30), ...CAMLOG(30)], screenshots: [12, 16, 20, 24],
    out: [LOOP('waffle', 16, 4.2, MIDDLE, 28)], publish: true,
  },
  {
    // Music night is made the next reward, and the live week raises its genre decision; the first
    // genre is picked by key and the dance break plays.
    id: 'site-loop-music', title: 'Landing page loop: music night', query: 'seed=1&speed=1', seconds: 40, warmup: 0.5,
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} sim.stageIncentive(s, 'music_night');` })}; await ${PRE_DECISION('music_night_genre', 16)}; ${CLEAN}; })()`,
    actions: [{ at: 0, js: NO_SAY }, ...CLEAR_EARLY, ...CHOOSE_WHEN('music_night_genre', 0, 1, 20, 3), ...Array.from({ length: 36 }, (_, i) => ({ at: i + 4.5, js: CLICK('Onward') })), ...CAMLOG(40)],
    screenshots: [16, 20, 24, 28],
    out: [LOOP('music', 19, 4.2, MIDDLE, 30)], publish: true,
  },
  {
    // Every monitor shows the ransom skull while the decision is open; the office holds still under
    // the card, so the camera sits on one person at their desk. The window keeps the card out.
    id: 'site-loop-ransomware', title: 'Landing page loop: ransomware on every screen', query: 'seed=9&speed=1', moment: 'ransomware --stage floor --choice 0', pre: true, seconds: 14, warmup: 6.5,
    setup: BARE, actions: [{ at: 0, js: NO_SAY }, ...FOLLOW(SEATED, 3.2, 0, 14, -320), ...CAMLOG(14)], screenshots: [3, 6, 9],
    out: [LOOP('ransomware', 5, 4.2, { x: 0, y: 1 / 6, w: 2 / 3, h: 2 / 3 }, 27)],
  },
  {
    // The on-screen rotate control (always up once the renderer offers it), not a cut: an
    // establishing hold, a quarter turn right, a hold on the new side, then back left to the start,
    // so the loop's two ends frame the same. UI stays up (full) since the control is the subject.
    id: 'site-loop-rotate', title: 'Landing page loop: turning the view with the rotate control', ...OFFICE(500, HQ), seconds: 10,
    setup: `(async () => { await ${PLAY({ weeks: 500, until: HQ, after: IN_OFFICE })}; ${CLEAN}; })()`,
    actions: [
      ...CLEAR_EARLY,
      { at: 2.2, js: CLICK_SEL('.camrot-b[aria-label="Turn the view right"]') },
      { at: 6.0, js: CLICK_SEL('.camrot-b[aria-label="Turn the view left"]') },
      ...CAMLOG(10),
    ],
    screenshots: [1, 3, 5, 9],
    out: [LOOP('rotate', 0, 9.5)],
  },
  {
    // A real game played by the squads bot (src/sim/bots.js), which forms squads once they unlock
    // and posts them to projects, so cohesion has time to build. Staff opens straight to the tab.
    id: 'site-still-squads', title: 'Landing page: the Squads tab in Staff', query: 'seed=8&speed=0', still: true, warmup: 0.5,
    setup: `(async () => { await ${PLAY({ weeks: 400, bot: 'squads', until: 's.squads.length >= 2 && s.squads.some((q) => q.cohesion >= 0.5)', after: IN_OFFICE })}; })()`,
    actions: [...CLEAR_EARLY, { at: 3.3, js: KEY('s', 'KeyS') }, { at: 4, js: CLICK_STARTS('Squads') }],
    screenshots: [4.6],
    // Cropped to the Squads tab card, starting at its own top edge, with the office below.
    out: [{ path: 'img/squads.webp', size: '1280x720', crop: { x: 300 / 1920, y: 85 / 1080, w: 1340 / 1920, h: 710 / 1080 }, publishAs: 'site-still-squads' }], publish: true,
  },

  {
    // Automate it, and live with it: the seeded game grows to an Agents-era HQ with the balanced bot, then the
    // automate-everything bot runs it until the live week raises the runaway cloud bill. The office
    // holds still under the card (the bill), so the camera pushes in on the hot rack.
    id: 'site-loop-automation', title: 'Landing page loop: the runaway cloud bill and the hot rack', query: 'seed=6&speed=1', seconds: 22, warmup: 0.5,
    setup: `(async () => { await ${RUNAWAY}; ${BARE}; ${CARD_IN} })()`,
    actions: [...CLEAR_EARLY, { at: 0, js: MARK_MOMENTS }, ...CAMLOG(22), ...[10, 14, 18, 21].map(at => ({ at, js: `(() => {
      const s = window.__HITL.state, R = window.__hitlRender;
      const card = document.querySelector('#ui .modal.decision');
      if (s.gameOver || s.pendingDecision?.eventId !== 'agent_runaway_spend' || s.pendingDecision.stage?.prop !== 'rack_hot' || !R.props.current().some(p => p.prop === 'rack_hot') || !card?.getClientRects().length || !card.innerText.includes('The cloud bill has feelings')) throw new Error('capture: runaway cloud bill and hot rack must be up in a live office');
    })()` }))],
    // The camera holds still on the rack, so the loop's two ends frame the same.
    // The rack's bounds grow with its smoke, so the aim point is taken once, when it appears.
    camera: [{ at: 0, target: { js: `(window.__rackAt ??= (${BOX('rack_hot')})() ?? undefined)` }, zoom: 2.8 }],
    screenshots: [10, 14, 18],
    // Cropped round the smoking rack and the bill card at native pixels, from the stretch where the
    // card keeps its incident footer (so the blend at the loop point never changes the card).
    out: [{ ...LOOP('automation', 11.0, 4.3, { x: 0.2396, y: 0.0185, w: 0.7083, h: 0.7083 }, 29), xfade: 0.8 }],
  },

  // New on the page: Yak, the Office Space nods, and decisions you can see.
  {
    // A meme posted mid-outage backfires: 😬 reactions and the team's replies under it, in #random.
    // The large Yak keeps the game running (the maximised one pauses it).
    id: 'site-yak-backfire', title: 'Landing page: a meme mid-outage, and the replies', query: 'seed=2&speed=1', warmup: 0.5, still: true,
    setup: `(async () => { await ${PRE_UNTIL({ weeks: 600, bot: 'balanced', turn: 's.office.stage < 1 || s.staff.length < 8', prep: IN_OFFICE + "s.policies.daily_standups = false;", after: CHAT_HISTORY, hit: '(c) => c.office.stage === 1 && c.outage?.weeks === 0' })}; ${YAK_ONLY}; ${YAK_HELPERS} })()`,
    actions: [
      ...CLEAR_EARLY, ...DISMISS_AT([4, 5, 6, 12, 18, 24, 28, 30, 31, 32, 32.5, 32.9], { escape: false }),
      // The launch results card (its button reads "Nice!") can land any time after the first 30 s of play.
      ...[36, 40, 44, 48, 52, 56, 58, 59, 59.4, 59.8].map((at) => ({ at, js: CLEAR_CARDS })), ...CHOOSE_WHEN('outage_unfixable', 2, 1, 64, 1), ...CHOOSE_WHEN(null, 0, 1, 64, 1),
      { at: 9.5, js: CLICK_SEL('.chat.yak .ysz[aria-label="large size"]') },
      { at: 10, js: CLICK_SEL('.ypost-btn') },
      { at: 11, js: `(() => {
        const b = [...document.querySelectorAll('.ypost-opt')].find((b) => b.getClientRects().length && /meme/i.test(b.textContent));
        if (!b || b.disabled || !window.__HITL.state.outage) throw new Error('capture: the meme must be available during an outage');
        const before = new Set(window.__HITL.state.chatLog.map(m => m.id));
        b.click();
        const post = window.__HITL.state.chatLog.find(m => !before.has(m.id) && m.image);
        if (post?.image.id !== 'this_is_fine') throw new Error('capture: Share a meme did not post the outage image');
        window.__yakMeme = structuredClone(post);
        (window.__captureMarks ??= []).push({ t: 11, label: 'yak-post', id: post.id, image: post.image.id, outage: true });
      })()` },
      ...[11.5, 16, 22, 28, 32, 48, 59].map((at) => ({ at, js: `[...document.querySelectorAll('.chat.yak button')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith('#random'))?.click()` })),
      { at: 59.5, js: "(async () => { const m = document.querySelector('.chat.yak .msg[data-id=\"' + CSS.escape(window.__yakMeme.id) + '\"]'); m?.scrollIntoView({ block: 'start' }); const img = m?.querySelector('.ymeme-img'); if (!img) throw new Error('yak: missing displayed image'); await img.decode(); })()" },
      { at: 60, js: 'window.__frameYak()' },
      YAK_CHECK(60.1, { crop: [376 / 1920, 190 / 1080, 1168 / 1920, 730 / 1080] }),
    ],
    screenshots: [11.1, 60.1],
    out: [{ path: 'img/yak-backfire.webp', size: '1280x800', from: 60.1, crop: { x: 376 / 1920, y: 190 / 1080, w: 1168 / 1920, h: 730 / 1080 } }], publish: true,
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
    out: [STILL('stapler', 8, { x: 0.4297, y: 0.4069, w: 0.15, h: 0.15 })], publish: true,
  },
  {
    // Both choices clear the stack, so it is shot while the decision is open, the card hidden.
    id: 'site-cover-sheets', title: 'Landing page: the TPS cover sheets', query: 'seed=1&speed=1', moment: 'cover_sheets', pre: true, warmup: 6.5, still: true, record: '3840x2160',
    setup: `(() => { ${CLEAN}; ${NO_CARD}; })()`,
    actions: [...OPEN(['cover_sheets']), ...FOLLOW(['cover_sheets'], 3.2, 0, 5)],
    screenshots: [4.5],
    out: [STILL('cover-sheets', 4.5, { x: 0.3917, y: 0.4125, w: 0.2083, h: 0.2083 })], publish: true,
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
    id: 'site-cheque', title: 'Landing page: the giant novelty cheque', query: 'seed=1&speed=1', warmup: 0.5, seconds: 20.5, record: '3840x2160',
    setup: `(async () => { await ${PRE_DECISION('ai_summit_hackathon', 600)}; ${CLEAN}; })()`,
    actions: [...CLEAR_EARLY, ...CHOOSE_WHEN('ai_summit_hackathon', 1, 1, 14), ...DISMISS_AT([12, 13, 14, 15], { escape: false }), ...FOLLOW(['giant_cheque'], 3.2, 0, 20)],
    screenshots: [17],
    out: [STILL('cheque', 17, { x: 0.3698, y: 0.2454, w: 0.25, h: 0.25 })],
  },
  {
    // Shot while the pivot is open, the card hidden. The cheque, this and the visitor also make the
    // decisions loop (scripts/reels/decisions.sh).
    id: 'site-whiteboard', title: 'Landing page: the whiteboard, the market has spoken', query: 'seed=1&speed=1', moment: 'pivot_pitch --stage floor', pre: true, warmup: 6.5, seconds: 8, record: '3840x2160',
    setup: `(() => { ${CLEAN}; ${NO_CARD}; })()`,
    actions: [...OPEN(['whiteboard_scrawl']), ...FOLLOW(['whiteboard_scrawl'], 3.2, 0, 8)],
    screenshots: [4.5],
    out: [STILL('whiteboard', 4.5, { x: 0.3125, y: 0.2106, w: 0.375, h: 0.375 })],
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

  // Feature inventory: one clip per staged moment in docs/features/moments.md. The week before the
  // decision comes from the event index, the game's own tick raises it, the camera follows the prop,
  // and the card is held about 5 s before its choice is made by key.
  ...MOMENTS.map(([name, query, prop, choice, zoom, length = 18]) => ({
    id: `moment-${name}`, title: `Staged moment: ${name}`, query: 'seed=1&speed=1', ...(PINNED_MOMENTS[name] ? {} : { moment: query, pre: name !== 'fumes' }), seconds: length, warmup: 6.5,
    setup: PINNED_MOMENTS[name] ? `(async () => { await ${PINNED_MOMENTS[name]}; ${CLEAN}; })()` : CLEAN,
    // No zoom: the game's wide view.
    actions: [{ at: 0, js: NO_SAY }, ...OPEN(), ...(zoom ? FOLLOW(prop.startsWith('(') ? prop : [prop], zoom, 0, length) : []),
      // Fumes: the card opens about 8 s in (the tick that raises it), so it is answered when it is up, not at a fixed time.
      // Any other decision that comes first (the pre-tick week can raise one) gets its first answer.
      ...(name === 'fumes' ? [...Array.from({ length: 2 * length }, (_, i) => ({ at: i / 2, js: `(() => { const H = window.__HITL, d = H.state.pendingDecision; if (d && d.eventId !== 'coffee_machine_broke') H.dispatch({ type: 'resolveDecision', choice: 0 }); })()` })), ...CHOOSE_WHEN('coffee_machine_broke', choice, 1, length, 1.5)] : PINNED_MOMENTS[name] ? [...SEEN_GUARD(PINNED_EVENT[name], length), ...CHOOSE_WHEN(null, choice, 1, length, 1.5)] : [{ at: 6.5, js: KEY(String(choice + 1), `Digit${choice + 1}`) }]),
      ...DISMISS_AT([7, 7.5, 9, 12], { escape: false }), ...CAMLOG(length)],
    screenshots: [5],
    // The fumes clip ends before the next week's incident card raises its red alarm.
    out: [{ path: `moments/${name}.mp4`, size: '1280x720', from: name === 'fumes' ? 0.5 : 1.5, seconds: name === 'fumes' ? 9.8 : length - 4, loop: 'none' }],
    publish: true,
  })),

  // Feature inventory: each shop item placed in the HQ mock the way a player would and upgraded to its top
  // level, the camera held close on it.
  ...ITEM_STILLS.map(([itemId, zoom = 3.2, era]) => ({
    id: `office-${itemId}`, title: `Office item: ${itemId}`, query: `mock=hq&time=day${era ? `&eras&eraArt=${era}` : ''}`, still: true, warmup: 1.5, record: '3840x2160',
    setup: `(async () => {
      const H = window.__HITL, s = H.state; s.cash = 1e9;
      ${era ? `s.era = { id: '${era}', since: s.week };` : ''}
      // An empty office, so the one item is the subject.
      s.office.placed = []; s.staff = [];
      const { suggestPlacement } = await import('/src/sim/office.js');
      const spot = suggestPlacement(s, ${JSON.stringify(itemId)});
      if (!spot) throw new Error('no free spot for ${itemId}');
      const r = H.dispatch({ type: 'placeItem', itemId: ${JSON.stringify(itemId)}, x: spot.x, y: spot.y, rot: spot.rot });
      if (!r.ok) throw new Error('placeItem refused: ' + (r.reason ?? ''));
      const p = s.office.placed.filter((q) => q.itemId === ${JSON.stringify(itemId)}).pop();
      for (let i = 0; i < 4; i++) if (!H.dispatch({ type: 'upgradeItem', id: p.id }).ok) break;
      ${CLEAN};
      // The "new things to place" card that a stage or era change raises would cover the item.
      document.getElementById('clean-shot').textContent += ' #ui .announce-back, #ui .modal-back, #ui .modal-dock { display: none !important; }';
    })()`,
    actions: [0.2, 0.6, 1, 1.4, 1.8].map((at) => ({ at, js: CLEAR_CARDS })),
    camera: [{ at: 0, target: { js: `(() => { let o = null; window.__hitlRender.scene.traverse((x) => { if (!o && x.userData.itemId === ${JSON.stringify(itemId)}) o = x; }); if (!o) return null; const v = o.getWorldPosition(new o.position.constructor()); return { x: v.x, z: v.z }; })()` }, zoom }],
    screenshots: [2],
    // The item sits at the middle of the frame; the 4K recording is cropped tight round it.
    out: [{ path: `items/${itemId}.webp`, size: '1280x720', from: 2, crop: { x: 0.31, y: 0.285, w: 0.38, h: 0.43 } }],
    publish: true,
  })),

  // The two bystander reactions of docs/features/moments.md, staged by the render checks' own fixtures on
  // the floor mock: a clicked person turns to the camera and barks; colleagues watch someone being fired.
  ...[
    ['click', "setupClick(R, S, { count: 1, voice: true })"],
    ['fired', 'setupFired(R, S)'],
  ].map(([name, call]) => ({
    id: `moment-${name}`, title: `Staged moment: ${name}`, query: 'mock=floor&time=day&speed=1', seconds: 6, warmup: 0,
    setup: `(async () => {
      const R = window.__hitlRender, S = window.__HITL.state;
      // The fixtures wait for people to settle at their spots, a frame at a time: the capture clock's frames.
      window.__advance = (n = 1) => { for (let i = 0; i < n; i++) window.__capture.frame(); };
      const { setupClick, setupFired } = await import('/src/render/checks.js');
      const ids = ${call};
      window.__subject = Array.isArray(ids) ? ids[0] : ids;
      if (window.__subject == null) throw new Error('the fixture found nobody to stage');
      // Where the subject stands as the reaction starts: the camera holds there while the bystanders turn.
      let o = null; R.scene.traverse((x) => { if (!o && x.userData.staffId === window.__subject) o = x.parent; });
      const v = o.getWorldPosition(new o.position.constructor());
      window.__at = { x: v.x, z: v.z };
      ${CLEAN};
    })()`,
    camera: [{ at: 0, target: { js: '(() => window.__at)()' }, zoom: 3.4 }],
    screenshots: [3],
    // The clicked person is a single seated figure: recorded at 4K and cropped round the middle of the frame.
    ...(name === 'click' ? { record: '3840x2160' } : {}),
    out: [{ path: `moments/${name}.mp4`, size: '1280x720', from: 0, seconds: 5, loop: 'none', ...(name === 'click' ? { crop: { x: 0.32, y: 0.28, w: 0.36, h: 0.4 } } : {}) }],
    publish: true,
  })),

  // The period chat apps of docs/features/yak.md and interface.md: a company founded in that era (played in
  // the page by the sim and the balanced bot, then loaded through the game's own save) with the large Yak panel.
  ...[['desknet', 'preinternet', 30, null], ['awayim', 'dotcom', 60, null], ['hipcheck', 'dotcom', 240, "s.era.id === 'web2'"]].map(([app, start, weeks, until]) => ({
    id: `iface-${app}`, title: `Interface: ${app}`, query: 'seed=1&eras&speed=0', still: true, warmup: 1,
    setup: `(async () => {
      const { createGame } = await import('/src/sim/state.js');
      const { tick } = await import('/src/sim/tick.js');
      const b = await import('/src/sim/bots.js');
      const { saveGame } = await import('/src/save/save.js');
      const s = createGame({ seed: 1, startEra: '${start}' });
      for (let i = 0; i < ${weeks} && !s.gameOver; i++) { if (${until ?? 'false'}) break; b.botDecide('balanced', s); b.botTurn('balanced', s); tick(s); }
      b.botDecide('balanced', s);
      if (!saveGame(s, localStorage)) throw new Error('could not save the era game');
      const r = window.__HITL.controls.continueGame();
      if (!r.ok) throw new Error('the game refused the era save: ' + (r.reason ?? ''));
      ${YAK_ONLY};
      window.__HITL.setSpeed?.(0);
      window.__HITL.emit((window.__HITL.state.chatLog ?? []).slice(-15));
    })()`,
    actions: CLEAR_EARLY,
    screenshots: [4.6], record: '3840x2160',
    // The chat panel sits in the bottom left corner; the 4K recording is cropped round it.
    out: [{ path: `iface/${app}.webp`, size: '500x410', from: 4.6, crop: { x: 0, y: 0.81, w: 0.13, h: 0.19 } }],
    publish: true,
  })),

  // docs/features/interface.md: Reports > Inventory of a pre-internet company with a boxed release and a batch on order.
  {
    id: 'iface-inventory', title: 'Interface: Reports > Inventory', query: 'seed=1&eras&speed=0', still: true, warmup: 1,
    setup: `(async () => {
      const { createGame } = await import('/src/sim/state.js');
      const { tick } = await import('/src/sim/tick.js');
      const { dispatch } = await import('/src/sim/index.js');
      const b = await import('/src/sim/bots.js');
      const { saveGame } = await import('/src/save/save.js');
      const s = createGame({ seed: 1, startEra: 'preinternet' });
      const boxed = () => s.products.find((p) => p.boxed);
      for (let i = 0; i < 160 && !s.gameOver && !(boxed() && boxed().boxed.installed > 0); i++) { b.botDecide('balanced', s); b.botTurn('balanced', s); tick(s); }
      b.botDecide('balanced', s);
      const p = boxed();
      if (!p) throw new Error('no boxed release in this career');
      s.cash = Math.max(s.cash, 50000);
      dispatch(s, { type: 'orderBatch', productId: p.id, units: 500 });
      if (!saveGame(s, localStorage)) throw new Error('could not save the era game');
      const r = window.__HITL.controls.continueGame();
      if (!r.ok) throw new Error('the game refused the era save: ' + (r.reason ?? ''));
      window.__HITL.setSpeed?.(0);
    })()`,
    actions: [...CLEAR_EARLY, { at: 0.6, js: KEY('r', 'KeyR') }, { at: 1.4, js: CLICK_STARTS('Inventory') },
      // A refused order would leave the order buttons live with no delivery line.
      { at: 2.6, js: "(() => { const t = document.body.textContent; if (!t.includes('A batch is already on its way') || !t.includes('500 copies due')) console.error('capture: the Inventory tab does not show the 500 copies on order'); })()" }],
    screenshots: [3],
    out: [{ path: 'iface/inventory.webp', size: '1230x562', from: 3, crop: { x: 0.18, y: 0.07, w: 0.64, h: 0.52 } }],
    publish: true,
  },

  // docs/features/interface.md: the NOC mode card of the Ops panel, with a Network Operations Center placed.
  {
    id: 'iface-noc', title: 'Interface: the NOC mode card', query: 'mock=hq&time=day&speed=0', still: true, warmup: 1,
    setup: `(async () => {
      const H = window.__HITL, s = H.state; s.cash = 1e9;
      const { suggestPlacement } = await import('/src/sim/office.js');
      const spot = suggestPlacement(s, 'noc');
      if (!spot) throw new Error('no free spot for the NOC');
      const r = H.dispatch({ type: 'placeItem', itemId: 'noc', x: spot.x, y: spot.y, rot: spot.rot });
      if (!r.ok) throw new Error('placeItem refused: ' + (r.reason ?? ''));
      // The mock's incident counters would sit over an empty log; the stage shows a company with no incidents.
      Object.assign(s.stats ??= {}, { incidents: 0, caught: 0, breaches: 0 });
    })()`,
    actions: [...CLEAR_EARLY, { at: 0.6, js: KEY('o', 'KeyO') },
      { at: 2.2, js: "(() => { if (!document.body.textContent.includes('Humans on the glass')) console.error('capture: the NOC card is not showing'); })()" }],
    screenshots: [3],
    out: [{ path: 'iface/noc.webp', size: '1230x648', from: 3, crop: { x: 0.18, y: 0.07, w: 0.64, h: 0.6 } }],
    publish: true,
  },

  // docs/features/moments.md: the minor incentive rewards, awarded on camera in a real game.
  ...['finger_traps', 'balloons', 'caricature', 'melon_bar'].map((reward) => ({
    id: `moment-incentive-${reward}`, title: `Staged moment: the ${reward} reward`, query: 'seed=1&speed=1', seconds: 20, warmup: 0.5, record: '3840x2160',
    setup: `(async () => { await ${RUNG(reward)}; ${CLEAN}; })()`,
    // The caricature goes up on the wall once the award is done, so the camera moves there after the winner.
    actions: [...CLEAR_EARLY, ...WAFFLE_ACTIONS(20),
      ...(reward === 'caricature' ? [...FOLLOW(WINNER, 3.4, 0, 8.9, 0, true), ...FOLLOW(CARICATURE, 3.4, 9, 20, 0, true)] : FOLLOW(WINNER, 3.4, 0, 20)),
      // The award moves the ladder one rung; a run that missed it would publish an ordinary office.
      { at: 17, js: `(() => { const s = window.__HITL.state; if (s.flags.incentiveCount !== window.__rung + 1 || !window.__winner) console.error('capture: the ${reward} award did not happen on camera'); })()` },
      ...CAMLOG(20)], screenshots: [6, 10, 14],
    out: [{ path: `moments/incentive-${reward}.mp4`, size: '1280x720', from: 6, seconds: 11, loop: 'none', crop: { x: 0.25, y: 0.2, w: 0.5, h: 0.56 } }],
    publish: true,
  })),

  // docs/features/sound.md: the four music night genres. The live week raises the genre decision, the item
  // answers it, and the game's own spotlight camera follows the dance break.
  ...['corporate_synthwave', 'motivational_polka', 'aggressive_bossa_nova', 'sad_lofi'].map((genre, i) => ({
    id: `moment-music-${genre}`, title: `Staged moment: music night, ${genre}`, query: 'seed=1&speed=1', seconds: 40, warmup: 0.5, record: '3840x2160', audio: true,
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} sim.stageIncentive(s, 'music_night');` })}; await ${PRE_DECISION('music_night_genre', 16)}; ${CLEAN}; })()`,
    actions: [{ at: 0, js: NO_SAY }, ...CLEAR_EARLY, ...CHOOSE_WHEN('music_night_genre', i, 1, 20, 3), ...Array.from({ length: 36 }, (_, k) => ({ at: k + 4.5, js: CLICK('Onward') })),
      // The genre card answered and the dance break raised: the winner is cleared and the ladder has moved.
      { at: 30, js: `(() => { const s = window.__HITL.state; if (s.pendingDecision?.eventId === 'music_night_genre' || s.flags.musicNightWinner) console.error('capture: the ${genre} genre was never picked'); })()` },
      ...CAMLOG(40)],
    screenshots: [14, 18, 22, 26],
    out: [{ path: `moments/music-${genre}.mp4`, size: '1280x720', from: 13, seconds: 14, loop: 'none', crop: { x: 0.2, y: 0.3, w: 0.5, h: 0.5 } }],
    // Not published until the onlookers leave an arc open to the camera: from every view the ring hides the dance.
  })),

  // docs/features/nods.md: the oat milk pallets. No bot reaches the decision, so a real game is played into the
  // Agents era and the event is scheduled for the next week; the game's tick raises it and stages the pallets.
  {
    id: 'decision-oat_milk', title: 'Decision prop: the oat milk pallets', query: 'seed=1&speed=1', seconds: 14, warmup: 1,
    setup: `(async () => { await ${PLAY({ weeks: 500, until: 's.week >= s.eraSchedule.agents + 2', after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} s.scheduled.push({ id: 'sch_oat', week: s.week + 1, kind: 'event', payload: { eventId: 'oat_milk', subjectId: null } });` })}; await ${PRE_DECISION('oat_milk', 4)}; ${CLEAN}; ${NO_CARD}; ${NO_SAY}; })()`,
    actions: [...OPEN(['oat_milk']), ...FOLLOW(['oat_milk'], 6, 0, 14, 0, true),
      { at: 11, js: `(() => { if (window.__HITL.state.pendingDecision?.eventId !== 'oat_milk') console.error('capture: the oat milk decision is not open'); })()` }],
    screenshots: [11],
    out: [{ path: 'decisions/oat_milk.webp', size: '1280x720', from: 11 }],
    publish: true,
  },

  // docs/features/decisions.md: the demo day smoothie. The decision is scheduled into a real game in its first
  // months (the bot never meets it), and the game's tick raises it and stages the smoothie on a desk.
  {
    id: 'decision-investor_demo_day', title: 'Decision prop: the demo day smoothie', query: 'seed=1&speed=1', seconds: 14, warmup: 1,
    setup: `(async () => { await ${PLAY({ weeks: 30, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} s.scheduled.push({ id: 'sch_demo', week: s.week + 1, kind: 'event', payload: { eventId: 'investor_demo_day', subjectId: null } });` })}; await ${PRE_DECISION('investor_demo_day', 4)}; ${CLEAN}; ${NO_CARD}; ${NO_SAY}; })()`,
    actions: [...OPEN(['smoothie']), ...FOLLOW(['smoothie'], 6, 0, 14, 0, true),
      { at: 11, js: `(() => { if (window.__HITL.state.pendingDecision?.eventId !== 'investor_demo_day') console.error('capture: the demo day decision is not open'); })()` }],
    screenshots: [11],
    out: [{ path: 'decisions/investor_demo_day.webp', size: '1280x720', from: 11 }],
    publish: true,
  },

  // docs/features/moments.md: the growth celebration. The engineer with the most open floor around them takes
  // the real choosePath action; the game's own celebrate and promotion beat follow.
  {
    id: 'moment-growth', title: 'Staged moment: a career path celebration', query: 'seed=1&speed=1', seconds: 20, warmup: 0.5, record: '3840x2160',
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE} (s.unlocks ??= {}).paths ??= s.week;` })}; ${CLEAN}; ${NO_SAY}; })()`,
    actions: [...CLEAR_EARLY,
      { at: 0.2, js: `(() => { const R = window.__hitlRender, s = window.__HITL.state; const at = new Map(); R.scene.traverse((o) => { if (o.userData.staffId) at.set(o.userData.staffId, o.parent.getWorldPosition(new o.position.constructor())); });
        const eng = s.staff.filter((p) => p.role === 'engineer' && !p.path && !p.remote && p.mood !== 'away' && at.has(p.id));
        const gap = (p) => Math.min(...[...at].filter(([id]) => id !== p.id).map(([, q]) => q.distanceTo(at.get(p.id))));
        const who = eng.reduce((a, b) => (gap(b) > gap(a) ? b : a), eng[0]); if (!who) { console.error('capture: no engineer to promote'); return; }
        who.pathPending = true; window.__winner = who.id; })()` },
      ...FOLLOW(WINNER, 3.4, 0.5, 20),
      { at: 2, js: `(() => { const r = window.__HITL.dispatch({ type: 'choosePath', staffId: window.__winner, pathId: 'architect' }); if (r && r.ok === false) console.error('capture: choosePath refused: ' + r.reason); })()` },
      { at: 16, js: `(() => { const p = window.__HITL.state.staff.find((x) => x.id === window.__winner); if (p?.path !== 'architect') console.error('capture: the career path was never chosen'); })()` },
      ...CAMLOG(20)], screenshots: [3, 5, 7, 9],
    out: [{ path: 'moments/growth.mp4', size: '1280x720', from: 1, seconds: 12, loop: 'none', crop: { x: 0.25, y: 0.2, w: 0.5, h: 0.56 } }],
    publish: true,
  },

  // The company party: a company-wide celebrate with its cause, in a real game. The banner is a DOM label
  // (.hitl-banner) that lives a few seconds, so the guard looks for it while it is up.
  {
    id: 'moment-company-party', title: 'Staged moment: the company party', query: 'seed=1&speed=1', seconds: 14, warmup: 0.5,
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE}` })}; ${CLEAN}; ${NO_SAY}; })()`,
    actions: [...CLEAR_EARLY,
      ...FOLLOW(`() => { const R = window.__hitlRender; const ps = []; R.scene.traverse((o) => { if (o.userData.staffId) ps.push(o.parent.getWorldPosition(new o.position.constructor())); }); if (!ps.length) return null; return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: 0, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }; }`, 2.4, 0, 14),
      { at: 1, js: `window.__HITL.emit([{ type: 'celebrate', cause: 'Notemind launched' }])` },
      { at: 2.5, js: `(() => { if (!document.querySelector('.hitl-banner')) console.error('capture: the party banner is not showing'); })()` },
      ...CAMLOG(14)], screenshots: [2, 3, 5, 8],
    out: [{ path: 'moments/company-party.mp4', size: '1280x720', from: 0.8, seconds: 7, loop: 'none', crop: { x: 0.1, y: 0.08, w: 0.8, h: 0.8 } }],
    publish: true,
  },

  // The same celebrate on a phone-width page, with a longer cause so the banner wraps. The banner is a DOM label
  // sized in CSS pixels, so the party clip records at 1920x1080 (not 4K) to keep it legible at 1280x720.
  {
    id: 'moment-company-party-phone', title: 'Staged moment: the company party banner on a phone', query: 'seed=1&speed=1', seconds: 8, warmup: 0.5, record: '390x844',
    setup: `(async () => { await ${PLAY({ weeks: 176, after: `${IN_OFFICE}${DROP_UNSTAFFED}${STAFF_IDLE}` })}; ${CLEAN}; ${NO_SAY}; })()`,
    actions: [...CLEAR_EARLY,
      ...FOLLOW(`() => { const R = window.__hitlRender; const ps = []; R.scene.traverse((o) => { if (o.userData.staffId) ps.push(o.parent.getWorldPosition(new o.position.constructor())); }); if (!ps.length) return null; return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: 0, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }; }`, 2.4, 0, 8),
      { at: 1, js: `window.__HITL.emit([{ type: 'celebrate', cause: 'Product of the Year: Notemind, with a very long name for the banner to wrap' }])` },
      { at: 3, js: `(() => { if (!document.querySelector('.hitl-banner')) console.error('capture: the party banner is not showing'); })()` }],
    screenshots: [3],
    out: [{ path: 'moments/company-party-phone.webp', size: '390x844', from: 3 }],
    publish: true,
  },

  // docs/features/decisions.md: what each decision stages in the office while its card is up. The pre-tick
  // snapshot is opened, the game's tick raises the card, the card is hidden and the camera holds on the prop.
  ...DECISION_PROPS.map(([id, query, prop, zoom = 5.5, center = false]) => ({
    id: `decision-${id}`, title: `Decision prop: ${id}`, query: 'seed=1&speed=1', moment: query, pre: true, still: true, warmup: 8,
    setup: `(() => { ${CLEAN}; ${NO_CARD}; ${NO_SAY}; })()`,
    // A prop a choice leaves behind exists only after the card is answered (by key, as a player would).
    actions: [...OPEN(), ...(LEFT_BEHIND.has(id) ? CHOOSE_WHEN(id, LEFT_BEHIND.get(id), 1, 8, 1.5) : []), ...FOLLOW([prop], zoom, 0, LEFT_BEHIND.has(id) ? 20 : 14, 0, center)],
    screenshots: [LEFT_BEHIND.has(id) ? 14 : 5],
    out: [{ path: `decisions/${id}.webp`, size: '1280x720', from: LEFT_BEHIND.has(id) ? 14 : 5 }],
    publish: !UNREADABLE_DECISIONS.has(id),
  })),

  // docs/features/yak.md: the reply prompts. The pre-tick save of the week that raises each one is opened,
  // the game's tick posts it, and the large Yak (which keeps the game running) is scrolled to the prompt.
  ...YAK_PROMPTS.map((kind) => ({
    id: `yak-${kind}`, title: `Yak reply prompt: ${kind}`, query: 'seed=1&speed=1', ...(PINNED_PROMPTS[kind] ? {} : { moment: kind, pre: true }), still: true, warmup: 0.5,
    setup: PINNED_PROMPTS[kind] ? `(async () => { await ${PINNED_PROMPTS[kind]}; ${YAK_ONLY}; })()` : `(() => { ${YAK_ONLY}; })()`,
    actions: [
      ...[0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18].map((at) => ({ at, js: CLEAR_CARDS })),
      ...CHOOSE_WHEN(null, 0, 1, 24, 1.5),
      { at: 0.5, js: CLICK_SEL('.chat.yak .ysz[aria-label="large size"]') },
      ...Array.from({ length: 40 }, (_, i) => ({ at: 2 + i * 0.5, js: `(() => {
        const p = window.__HITL.state.chatPrompts.find((q) => q.kind === ${JSON.stringify(kind)});
        if (!p) return;
        const find = () => document.querySelector('.chat.yak .yprompt[data-prompt="' + CSS.escape(p.id) + '"]');
        if (!find()) [...document.querySelectorAll('.chat.yak button')].find((b) => b.getClientRects().length && b.textContent.trim().startsWith('#' + p.channel))?.click();
        const el = find();
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        (window.__captureMarks ??= []).push({ t: ${2 + i * 0.5}, label: 'yak-prompt', kind: ${JSON.stringify(kind)}, id: p.id, text: el.textContent.slice(0, 60), inPanel: (() => { const r = el.getBoundingClientRect(), q = document.querySelector('.chat.yak').getBoundingClientRect(); return r.top >= q.top && r.bottom <= q.bottom; })() });
      })()` })),
      // The still is only right when the prompt is open and fully in view just before it is taken.
      { at: 21.8, js: `(() => {
        const p = window.__HITL.state.chatPrompts.find((q) => q.kind === ${JSON.stringify(kind)});
        const el = p && document.querySelector('.chat.yak .yprompt[data-prompt="' + CSS.escape(p.id) + '"]');
        // console.error fails this item only; a throw would end the whole capture run.
        if (!el) return console.error('capture: the ${kind} prompt is not in the Yak panel');
        const r = el.getBoundingClientRect(), q = document.querySelector('.chat.yak').getBoundingClientRect();
        if (!r.width || r.top < q.top || r.bottom > q.bottom) console.error('capture: the ${kind} prompt is outside the Yak panel');
      })()` },
    ],
    screenshots: [22],
    out: [{ path: `yak/${kind}.webp`, size: '640x747', from: 22, crop: { x: 0, y: 0.43, w: 0.27, h: 0.56 }, publishAs: `yak-${kind}` }],
    publish: true,
  })),
];
