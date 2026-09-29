import { YAK_HELPERS, YAK_CHECK } from '../feature-media/yak.js';
import { LOAD_PIN } from './pins.js';
import { GROW, EMPTY_DESKS } from '../feature-media/manifest.js';
import { PRE_UNTIL, IN_OFFICE, CHAT_HISTORY, YAK_ONLY, CAMLOG, CLEAR_EARLY, DISMISS_AT, CHOOSE_WHEN, CLICK_SEL, STAGE_ONLY, CLEAR_CARDS } from '../capture-manifest.js';
// A player closes any launch or unlock card that turns up while the Yak thread plays out; a modal card holds the clock.
const CARDS_EVERY = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => ({ at: from + i * step, js: CLEAR_CARDS }));

// Everything the trailer is made of: which captured clips, where each cut starts and ends, the cards,
// the music and stingers, and when each voiceover line lands. Change the trailer here; build.js only
// executes this file.
//
// Beats run back to back in order. A clip beat names a capture item (`item`, an id from
// scripts/capture-manifest.js), overrides for it (`capture`), the second of the clip to cut from
// (`from`) and how long the cut lasts (`dur`). A card beat names a card from `cards`.
// `vx` places the square window the vertical cut shows (0 is the left edge, 1 the right).
// `punch` is a camera-style push-in over the beat: { at: [x, y] as fractions of the frame, zoom: [from, to] }.

export const OUTPUT = {
  width: 1920,
  height: 1080,
  fps: 30,
  vertical: { width: 1080, height: 1920 },
  // Delivered loudness for web video.
  lufs: -14,
  truePeak: -1.5,
};

export const PLAY_URL = 'https://humanintheloopgame.com/';

export const CARDS = {
  title: { logo: true, lines: [] },
  end: { logo: true, captions: false, lines: ['Play free in your browser', PLAY_URL.replace(/^https:\/\//, '').replace(/\/$/, '')] },
};

// Page JS for a beat's `actions`: closes a "new things to place" card the way a player would.
const LATER = (at) => ({ at, js: "[...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.textContent.trim() === 'Later')?.click()" });

// Page JS for a beat's `actions`: shows Yak's recent history, which a fast-forwarded game never presented.
const YAK_HISTORY = (at) => ({ at, js: 'window.__HITL.emit((window.__HITL.state.chatLog ?? []).slice(-15))' });

// The camera target and zoom a beat's capture keeps: `target` is where the view already looks
// (VIEW0), or a party's centre (PARTY). In-engine moves only; `punch` (a 2D zoom) is not used.
const VIEW0 = { js: '(window.__v0 ??= window.__hitlRender.view())' };
const PEOPLE = { js: "(() => { let n = 0, x = 0, z = 0; window.__hitlRender.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); return window.__people ??= (n ? { x: x / n, z: z / n } : null); })()" };
// Speech bubbles and work labels hidden, for a shot about something else.
const NO_SAY_T = (at) => ({ at, js: "(() => { const st = document.createElement('style'); st.textContent = '.hitl-say, .hitl-leads { display: none !important; }'; document.head.append(st); })()" });
// The post's facepalmer, found through the renderer and held for the reaction shot.
const FACEPALMER = { js: `(() => {
  const R = window.__hitlRender;
  if (!window.__facepalmer) {
    // Of everyone facepalming, the one facing the camera most squarely.
    const p = window.__HITL.state.staff.filter((p) => R.probe(p.id)?.anim?.startsWith('facepalm')).sort((a, b) => R.probe(a.id).faceCam - R.probe(b.id).faceCam)[0];
    if (!p) return null;
    window.__facepalmer = p.id;
  }
  const e = R.probe(window.__facepalmer)?.eyes;
  return e ? { x: e[0], z: e[2] } : null;
})()` };
// The first dancer of a music night.
const DANCER = { js: "(() => { const R = window.__hitlRender, id = R.incentives?.dance?.dancers?.[0]; if (id == null) return null; let o = null; R.scene.traverse((x) => { if (!o && x.userData.staffId === id) o = x.parent; }); if (!o) return null; const v = o.getWorldPosition(new o.position.constructor()); return { x: v.x, z: v.z }; })()" };
const PARTY = { js: '(() => { const R = window.__hitlRender; const c = R.incentives?.party?.center ?? R.incentivesFrame; return c ? { x: c.x, z: c.z } : null; })()' };
// Hides the docked era card, so an era beat shows the office redressing itself.
const NO_ERA_CARD = (at) => ({ at, js: "(() => { const st = document.createElement('style'); st.textContent = '#ui .announce-back.docked, #ui .topbar, #ui .tray, #ui .bottom, #ui .toasts, .hitl-say, .hitl-leads { display: none !important; }'; document.head.append(st); })()" });

// Optional scenes that can be captured without appearing in the cut.
export const DEFERRED_CAPTURES = [];

// The one-minute cut (#668). Beats 4 (build) and 11 (the cloud bill) need the game changes noted there.
// One company for the whole outage stretch (seed 13): the agents watch a level-2+ NOC and its next incident is
// misread, so the alert, the Yak thread and the facepalm all come from the same game.
const NOC_HIT = '(c) => c.ops.noc === "agents" && c.outage?.misread && c.outage.weeks === 0';
const OUTAGE_PLAY = { weeks: 1000, bot: 'balanced', prep: IN_OFFICE + "s.policies.daily_standups = false;", after: CHAT_HISTORY, hit: NOC_HIT };
const YAK_SETUP = `(async () => { await ${LOAD_PIN('outage')}; ${YAK_ONLY}; ${YAK_HELPERS} })()`;

// A quiet week (seed 62, week 124) where "Share a meme" picks the PC LOAD LETTER image: the post
// lands in Yak, then is opened full size the way a player taps it.
const MEME_PLAY = { weeks: 500, bot: 'balanced', turn: 's.office.stage < 1 || s.staff.length < 8', prep: IN_OFFICE + "s.policies.daily_standups = false;", after: CHAT_HISTORY, hit: '(c) => c.week === 125' };
const MEME_SETUP = `(async () => { await ${LOAD_PIN('meme')}; ${YAK_ONLY}; })()`;
const MEME_ACTIONS = [
  ...CLEAR_EARLY, ...DISMISS_AT([5, 6, 7], { escape: false }), ...CHOOSE_WHEN(null, 0, 1, 9, 1),
  { at: 1, js: CLICK_SEL('.chat.yak .ysz[aria-label="large size"]') },
  { at: 1.4, js: CLICK_SEL('.ypost-btn') },
  { at: 1.9, js: `(() => { const b = [...document.querySelectorAll('.ypost-opt')].find((b) => b.getClientRects().length && /meme/i.test(b.textContent)); if (!b || b.disabled) throw new Error('trailer: Share a meme unavailable'); const s = window.__HITL.state; if (s.week !== 124) throw new Error('trailer: meme week is ' + s.week); b.click(); const post = s.chatLog.at(-1); if (post?.image?.id !== 'change_my_mind') throw new Error('trailer: the meme is ' + post?.image?.id); })()` },
  { at: 3.2, js: "(() => { const st = document.createElement('style'); st.textContent = '.memebox-img { width: 1160px !important; height: auto !important; max-width: none !important; max-height: none !important; }'; document.head.append(st); })()" },
  { at: 3.3, js: `[...document.querySelectorAll('.chat.yak .ymeme')].at(-1)?.click()` },
];

const NOC_SETUP = `(async () => { await ${LOAD_PIN('outage')}; ${STAGE_ONLY}; })()`;
// The NOC item's spot on the floor, for the camera.
const NOC_AT = { js: `(window.__nocAt ??= (() => {
  const R = window.__hitlRender, T = R.THREE, s = window.__HITL.state, noc = s.office.placed.find((i) => i.itemId === 'noc');
  const r = noc && R.screenRectOf({ kind: 'item', id: noc.id });
  if (!r) return undefined;
  const ray = new T.Raycaster(), p = new T.Vector3();
  ray.setFromCamera(new T.Vector2(((r.left + r.width / 2) / innerWidth) * 2 - 1, -(((r.top + r.height / 2) / innerHeight) * 2 - 1)), R.camera);
  return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p) ? { x: p.x, z: p.z } : undefined;
})())` };
const NOC_CAPTURE = { query: 'seed=13&speed=1', setup: NOC_SETUP, still: false, seconds: 20, screenshots: [], camera: [{ at: 0, target: NOC_AT, zoom: 2.6 }], actions: [...CLEAR_EARLY, ...DISMISS_AT([4, 5, 6, 12, 14, 16], { escape: false }), ...CHOOSE_WHEN('outage_unfixable', 2, 1, 20, 1), ...CHOOSE_WHEN(null, 0, 1, 20, 1), ...CAMLOG(20)] };

export const BEATS = [
  { id: 'title', card: 'title', dur: 2.0 },
  // The founders' first desks, with a slow in-engine push-in.
  { id: 'garage', item: 'growth-garage', capture: { seconds: 8, setup: LOAD_PIN('garage'), camera: [{ at: 1, target: VIEW0, zoom: 1.0 }, { at: 7, target: VIEW0, zoom: 1.35 }] }, from: 1.0, dur: 6.0 },
  // From just before the move, so the new floor drops onto the garage on screen.
  { id: 'office', item: '2-2-office-move', capture: { seconds: 9 }, actions: [LATER(0.1), NO_ERA_CARD(0)], from: 1.8, dur: 3.5 },
  // The player places a foosball table (the build bar is the one interface kept), and people come to play.
  { id: 'build', item: 'trail-build', from: 0.9, dur: 8.4 },
  // The hire panel: a candidate hired.
  { id: 'hire', item: 'trail-hire', from: 0.9, dur: 2.2 },
  // The first launch on the Office Floor, so the story never steps back into the garage.
  { id: 'launch', item: 'trail-launch', from: 72.0, dur: 2.4 },
  { id: 'noc-watch', item: 'site-yak-backfire', capture: NOC_CAPTURE, from: 5.1, dur: 4.2 },
  { id: 'incident', item: 'site-yak-backfire', capture: NOC_CAPTURE, from: 9.3, dur: 2.2 },
  // A meme posted mid-outage, and the reactions.
  // The thread includes the backfired post and its reply; speech bubbles stay hidden.
  { id: 'yak', item: 'site-yak-backfire', capture: { query: 'seed=13&speed=1', setup: YAK_SETUP, still: false, seconds: 64, screenshots: [] }, actions: [NO_SAY_T(0), ...CARDS_EVERY(13, 58, 1.5), YAK_CHECK(61.5), YAK_CHECK(63.06)], from: 60.1, dur: 3.1 },
  { id: 'yak-react', item: 'site-yak-backfire', capture: { query: 'seed=13&speed=1', setup: YAK_SETUP, still: false, seconds: 16, screenshots: [11.2, 11.6, 12.4, 13.2, 14, 14.8, 15.6], camera: [{ at: 0, target: VIEW0, zoom: 1 }, { at: 11, target: VIEW0, zoom: 1 }, { at: 11.2, target: FACEPALMER, zoom: 4.2 }] }, actions: [...CAMLOG(16), NO_SAY_T(0), { at: 11, js: "document.querySelector('#ui').style.display = 'none'" }, { at: 11.3, js: "if (!window.__facepalmer) throw new Error('trailer: the post has no facepalmer')" }], from: 11.2, dur: 2.0 },
  // The PC LOAD LETTER meme held full size from its first frame, so the sign reads. No narration.
  { id: 'printer-meme', item: 'site-yak-backfire', capture: { query: 'seed=62&speed=1', setup: MEME_SETUP, still: false, seconds: 8, screenshots: [], actions: MEME_ACTIONS }, from: 3.65, dur: 3.5 },
  { id: 'printer', item: 'trail-fly-printer', capture: { seconds: 36, pin: 'printer' }, from: 26 + 4 / 30, dur: 7.0 },
  { id: 'era-chatgbt', item: 'real-era-chatgbt', actions: [NO_ERA_CARD(0)], from: 9.0, dur: 4.1 },
  { id: 'era-agents', item: 'real-era-agents', actions: [NO_ERA_CARD(0)], from: 9.0, dur: 2.4 },
  // The runaway cloud bill: the hot rack smoking behind the card.
  { id: 'cloud-bill', item: 'site-loop-automation', from: 10.0, dur: 4.0 },
  // Consolidation's redress is mostly cleanup: the beat frames the crowd, the busiest HQ.
  { id: 'era-consolidation', item: 'real-era-consolidation', actions: [NO_ERA_CARD(0)], capture: { camera: [{ at: 0, target: PEOPLE, zoom: 1.7 }] }, from: 9.0, dur: 2.8 },
  // The flying camera's orbit onto the waffle table.
  { id: 'waffle', item: 'trail-fly-waffle', from: 14.3, dur: 4.2 },
  { id: 'dance', item: 'site-loop-music', capture: { camera: [{ at: 14, target: DANCER, zoom: 2.2 }] }, from: 19.0, dur: 3.0 },
  // Seed 18 with no hiring after Consolidation, so attrition empties most desks; pushes in on the largest empty group.
  { id: 'plateau', item: 'growth-late', capture: { query: 'seed=18&speed=1&time=day', setup: GROW(800, { lateHires: false }), camera: [{ at: 0, target: VIEW0, zoom: 1.25 }, { at: 1, target: VIEW0, zoom: 1.25 }, { at: 5.5, target: EMPTY_DESKS, zoom: 2.5, ease: 'inOut' }] }, from: 0.5, dur: 5.0 },
  { id: 'end', card: 'end', dur: 8.0 },
];

// Paths are relative to the repo root. `at` is seconds from the start of the trailer, or
// { beat, offset } to follow a beat wherever it lands.
// The music is one bed at a constant level under the whole trailer (looped if the trailer is longer).
// Optional: `swaps` (tracks that replace the bed for a stretch, crossfaded over `fade`), `stingers`, and
// `duck` ({ db, attack, release }: a dip under each narrator line).
export const MUSIC = {
  bed: { file: 'public/audio/music/classic/a_full.ogg', gain: -8, fadeIn: 0.3 },
  // The printer's own cue replaces the bed for its beat and lands on the printer beat's cut.
  swaps: [{ file: 'public/audio/moments/printer_smash.ogg', seek: 9.9, at: { beat: 'printer' }, until: { beat: 'era-chatgbt' }, fade: 0.3, gain: -6 }],
  // The foosball rally once both players are at the table: the game plays its cue once per use, so
  // the trailer places a few hits of the same sound under the bed.
  stingers: [5.15, 5.7, 6.35, 6.9, 7.6].map((offset) => ({ file: 'public/audio/sfx/foosball.ogg', at: { beat: 'build', offset }, gain: -12 })),
  duck: { db: 6, attack: 0.15, release: 0.4 },
  fadeOut: 1.5,
};

// The narration. `file` is the rendered line in the VO directory (build.js --vo); `text` doubles as
// the burned-in caption and the TTS script unless `say` gives the spoken form (a URL read aloud);
// scripts/trailer/vo/render.sh reads it through `npm run trailer -- --print-vo`.
// Each line's window is its offset and `max`, the most seconds of speech it may run, and keeps it
// inside one shot. scripts/trailer/vo/table.mjs prints every window and checks it against the cuts
// and the rendered files, which start a few hundredths of a second before their first word.
export const VO = {
  gain: 0,
  captions: true,
  lines: [
    { id: 'l1', at: { beat: 'garage', offset: 0.4 }, max: 5.1, text: 'Every great company starts in a garage. This one is still paying rent on it.' },
    { id: 'l2a1', at: { beat: 'hire', offset: 0.3 }, max: 1.3, text: 'Hire humans.' },
    { id: 'l2a2', at: { beat: 'launch', offset: 0.3 }, max: 1.35, text: 'Ship products.' },
    { id: 'l2c', at: { beat: 'noc-watch', offset: 0.3 }, max: 3.4, text: 'The dashboards are green. The agents are very confident.' },
    { id: 'l2b', at: { beat: 'incident', offset: 0.2 }, max: 1.7, text: 'Call the outage a stress test.' },
    { id: 'l7', at: { beat: 'yak', offset: 0.3 }, max: 2.5, text: 'Your team talks. Mostly in memes.' },
    { id: 'l3', at: { beat: 'era-chatgbt', offset: 0.2 }, max: 3.6, text: 'Survive the AI eras. First chatbots.' },
    { id: 'l3b', at: { beat: 'era-agents', offset: 0.3 }, max: 1.1, text: 'Then agents.' },
    { id: 'l9', at: { beat: 'cloud-bill', offset: 0.3 }, max: 3.3, text: 'Just automate everything. Read the bill later.' },
    { id: 'l3c', at: { beat: 'era-consolidation', offset: 0.2 }, max: 2.2, text: 'Then whatever the agents hire.' },
    { id: 'l4a', at: { beat: 'waffle', offset: 0.4 }, max: 2.3, text: 'Reward your team with waffles.' },
    { id: 'l4b', at: { beat: 'dance', offset: 0.3 }, max: 2.1, text: 'And a mandatory dance break.' },
    { id: 'l10', at: { beat: 'plateau', offset: 0.5 }, max: 4.0, text: "Or automate them all, and see who's left." },
    { id: 'l5', at: { beat: 'end', offset: 0.4 }, max: 3.0, text: 'Human in the Loop. Someone has to be.' },
    { id: 'l6', at: { beat: 'end', offset: 3.6 }, max: 4.2, text: 'Play it free, right now, at humanintheloopgame.com.', say: 'Play it free, right now, at human in the loop game dot com.' },
  ],
};

// The games the pinned states come from (node scripts/trailer/pin.mjs): each replays a bot game to the week
// before its beat's subject. The printer pin is an indexed moment (scripts/events/find.js), copied as it is.
export const PIN_SOURCES = {
  outage: { query: 'seed=13&speed=1', setup: `(async () => { await ${PRE_UNTIL(OUTAGE_PLAY)}; })()` },
  meme: { query: 'seed=62&speed=1', setup: `(async () => { await ${PRE_UNTIL(MEME_PLAY)}; })()` },
  garage: { query: 'seed=5&speed=1&time=day', setup: GROW(4) },
  printer: { moment: 'printer_jam --stage floor --choice 0' },
};
