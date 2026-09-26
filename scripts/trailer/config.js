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
// Pushes in on the Yak message containing `text` over `secs` (an eased CSS transform the capture
// steps frame by frame) onto the message and its replies, until they fill most of the frame, then holds.
const YAK_PUSH = (at, text, secs = 1.4) => ({ at, js: `(() => { const yak = document.querySelector('#ui .chat.yak'); if (!yak) return;
  const m = [...yak.querySelectorAll('.msg')].find((e) => e.textContent.includes(${JSON.stringify('TEXT')})); if (!m) return;
  // The message and its thread's replies, framed together.
  const rs = [...yak.querySelectorAll('.msg[data-root="' + m.dataset.root + '"]')].map((e) => e.getBoundingClientRect());
  const r = { left: Math.min(...rs.map((x) => x.left)), top: Math.min(...rs.map((x) => x.top)), right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
  r.width = r.right - r.left; r.height = r.bottom - r.top;
  const k = Math.min(6, (innerWidth * 0.9) / r.width, (innerHeight * 0.85) / r.height);
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  yak.style.transformOrigin = '0 0'; yak.style.transition = 'transform ${'SECS'}s cubic-bezier(0.65, 0, 0.35, 1)';
  const yr = yak.getBoundingClientRect();
  requestAnimationFrame(() => { yak.style.transform = 'translate(' + (innerWidth / 2 - cx * k + (k - 1) * yr.left) + 'px,' + (innerHeight / 2 - cy * k + (k - 1) * yr.top) + 'px) scale(' + k + ')'; }); })()`.replace('TEXT', text).replace('SECS', secs) });
// Yak at trailer size: the panel scaled up, so the thread and its reactions read.
const BIG_YAK = (at) => ({ at, js: "(() => { const st = document.createElement('style'); st.textContent = '#ui .chat.yak { zoom: 1.6; }'; document.head.append(st); })()" });
// Speech bubbles and work labels hidden, for a shot about something else.
const NO_SAY_T = (at) => ({ at, js: "(() => { const st = document.createElement('style'); st.textContent = '.hitl-say, .hitl-leads { display: none !important; }'; document.head.append(st); })()" });
// The post's facepalmer, found through the renderer and held for the reaction shot.
const FACEPALMER = { js: `(() => {
  const R = window.__hitlRender;
  if (!window.__facepalmer) {
    const p = window.__HITL.state.staff.find((p) => R.probe(p.id)?.anim?.startsWith('facepalm'));
    if (!p) return null;
    window.__facepalmer = p.id;
  }
  let o = null;
  R.scene.traverse((x) => { if (!o && x.userData.staffId === window.__facepalmer) o = x.parent; });
  if (!o) return null;
  const v = o.getWorldPosition(new o.position.constructor());
  return { x: v.x, z: v.z };
})()` };
// The first dancer of a music night.
const DANCER = { js: "(() => { const R = window.__hitlRender, id = R.incentives?.dance?.dancers?.[0]; if (id == null) return null; let o = null; R.scene.traverse((x) => { if (!o && x.userData.staffId === id) o = x.parent; }); if (!o) return null; const v = o.getWorldPosition(new o.position.constructor()); return { x: v.x, z: v.z }; })()" };
const PARTY = { js: '(() => { const R = window.__hitlRender; const c = R.incentives?.party?.center ?? R.incentivesFrame; return c ? { x: c.x, z: c.z } : null; })()' };
// Hides the docked era card, so an era beat shows the office redressing itself.
const NO_ERA_CARD = (at) => ({ at, js: "(() => { const st = document.createElement('style'); st.textContent = '#ui .announce-back.docked, #ui .topbar, #ui .tray, #ui .bottom, #ui .toasts, .hitl-say, .hitl-leads { display: none !important; }'; document.head.append(st); })()" });

// Scene 7b remains capturable while its facepalm pose/staging awaits an art fix.
export const DEFERRED_CAPTURES = [
  { id: 'yak-react', item: 'site-yak-backfire', capture: { still: false, seconds: 13, screenshots: [11.2, 11.6, 12.4], camera: [{ at: 0, target: VIEW0, zoom: 1 }, { at: 11, target: VIEW0, zoom: 1 }, { at: 11.2, target: FACEPALMER, zoom: 4.2 }] }, actions: [NO_SAY_T(0), { at: 11, js: "document.querySelector('#ui').style.display = 'none'" }, { at: 11.3, js: "if (!window.__facepalmer) throw new Error('trailer: the post has no facepalmer')" }], from: 11.0, dur: 1.5 },
];

// The one-minute cut (#668). Beats 4 (build) and 11 (the cloud bill) need the game changes noted there.
export const BEATS = [
  { id: 'title', card: 'title', dur: 2.0 },
  // The founders' first desks, with a slow in-engine push-in.
  { id: 'garage', item: 'growth-garage', capture: { seconds: 8, camera: [{ at: 1, target: VIEW0, zoom: 1.0 }, { at: 7, target: VIEW0, zoom: 1.35 }] }, from: 1.0, dur: 6.0 },
  { id: 'office', item: '2-2-office-move', capture: { seconds: 9 }, actions: [LATER(0.1), NO_ERA_CARD(0)], from: 2.8, dur: 3.5 },
  // The player places a foosball table (the build bar is the one interface kept), and people come to play.
  { id: 'build', item: 'trail-build', capture: { seconds: 7 }, from: 0.5, dur: 4.0 },
  // The hire panel: a candidate hired.
  { id: 'hire', item: 'trail-hire', from: 0.6, dur: 2.2 },
  // The first launch on the Office Floor, so the story never steps back into the garage.
  { id: 'launch', item: 'trail-launch', from: 72.0, dur: 2.4 },
  { id: 'incident', item: 'site-loop-incident', from: 8.8, dur: 3.2 },
  // A meme posted mid-outage, and the reactions.
  // The thread includes the backfired post and its reply; speech bubbles stay hidden.
  { id: 'yak', item: 'site-yak-backfire', capture: { still: false, seconds: 36, screenshots: [] }, actions: [NO_SAY_T(0), YAK_PUSH(31.9, 'me in standup')], from: 31.6, dur: 3.1 },
  // PC LOAD LETTER from the flying camera: the carry ending, then the hits, to the rap's last word. No narration.
  { id: 'printer', item: 'trail-fly-printer', from: 20.0, dur: 5.7 },
  { id: 'era-chatgbt', item: 'real-era-chatgbt', actions: [NO_ERA_CARD(0)], from: 7.9, dur: 4.1 },
  { id: 'era-agents', item: 'real-era-agents', actions: [NO_ERA_CARD(0)], from: 7.9, dur: 2.4 },
  // The runaway cloud bill: the hot rack smoking behind the card.
  { id: 'cloud-bill', item: 'site-loop-automation', from: 10.0, dur: 4.0 },
  // Consolidation's redress is mostly cleanup: the beat frames the crowd, the busiest HQ.
  { id: 'era-consolidation', item: 'real-era-consolidation', actions: [NO_ERA_CARD(0)], capture: { camera: [{ at: 0, target: PEOPLE, zoom: 1.7 }] }, from: 7.9, dur: 2.8 },
  // The flying camera's orbit onto the waffle table.
  { id: 'waffle', item: 'trail-fly-waffle', from: 14.3, dur: 4.2 },
  { id: 'dance', item: 'site-loop-music', capture: { camera: [{ at: 14, target: DANCER, zoom: 2.2 }] }, from: 19.0, dur: 3.0 },
  // The Plateau: 18 people left, pushing in on the empty desks.
  { id: 'plateau', item: 'growth-late', from: 0.5, dur: 5.0 },
  { id: 'end', card: 'end', dur: 8.0 },
];

// Paths are relative to the repo root. `at` is seconds from the start of the trailer, or
// { beat, offset } to follow a beat wherever it lands.
// The music is one bed at a constant level under the whole trailer (looped if the trailer is longer).
// Optional: `swaps` (tracks that replace the bed for a stretch, crossfaded over `fade`), `stingers`, and
// `duck` ({ db, attack, release }: a dip under each narrator line).
export const MUSIC = {
  bed: { file: 'public/audio/music/classic/a_full.ogg', gain: -14, fadeIn: 0.3 },
  // The printer's own cue replaces the bed for its beat: 9.9 s of the cue lands on the beat's cut.
  swaps: [{ file: 'public/audio/moments/printer_smash.ogg', seek: 9.9, at: { beat: 'printer' }, until: { beat: 'era-chatgbt' }, fade: 0.3, gain: -6 }],
  stingers: [],
  duck: { db: 6, attack: 0.15, release: 0.4 },
  fadeOut: 1.5,
};

// The narration. `file` is the rendered line in the VO directory (build.js --vo); `text` doubles as
// the burned-in caption and the TTS script unless `say` gives the spoken form (a URL read aloud) (scripts/trailer/vo.py reads it through `npm run trailer -- --print-vo`).
// Each line's window (its offset and the most it may run) keeps it inside one shot; the rendered
// files start 0.04 s before their first word.
export const VO = {
  gain: 0,
  captions: true,
  lines: [
    { id: 'l1', at: { beat: 'garage', offset: 0.4 }, text: 'Every great company starts in a garage. This one is still paying rent on it.' },
    { id: 'l2a1', at: { beat: 'hire', offset: 0.3 }, text: 'Hire humans.' },
    { id: 'l2a2', at: { beat: 'launch', offset: 0.3 }, text: 'Ship products.' },
    { id: 'l2b', at: { beat: 'incident', offset: 0.3 }, text: 'Call the outage a stress test.' },
    { id: 'l7', at: { beat: 'yak', offset: 0.4 }, text: 'Your team talks. Mostly in memes.' },
    { id: 'l3', at: { beat: 'era-chatgbt', offset: 0.2 }, text: 'Survive the AI eras. First chatbots.' },
    { id: 'l3b', at: { beat: 'era-agents', offset: 0.3 }, text: 'Then agents.' },
    { id: 'l9', at: { beat: 'cloud-bill', offset: 0.3 }, text: 'Just automate everything. Read the bill later.' },
    { id: 'l3c', at: { beat: 'era-consolidation', offset: 0.2 }, text: 'Then whatever the agents hire.' },
    { id: 'l4a', at: { beat: 'waffle', offset: 0.4 }, text: 'Reward your team with waffles.' },
    { id: 'l4b', at: { beat: 'dance', offset: 0.3 }, text: 'And a mandatory dance break.' },
    { id: 'l10', at: { beat: 'plateau', offset: 0.5 }, text: "Or automate them all, and see who's left." },
    { id: 'l5', at: { beat: 'end', offset: 0.4 }, text: 'Human in the Loop. Someone has to be.' },
    { id: 'l6', at: { beat: 'end', offset: 3.6 }, text: 'Play it free, right now, at humanintheloopgame.com.', say: 'Play it free, right now, at human in the loop game dot com.' },
  ],
};
