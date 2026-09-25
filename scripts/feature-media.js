import { ITEMS as REVIEW } from './capture-manifest.js';

// Feature media: capture.js items (see scripts/capture-manifest.js for the item fields) with the files
// to make from each recording (`out`, see scripts/feature-media.mjs). Paths mirror where the files are
// used: img/ and media/ are the landing page's (humanintheloopgame-site), so a render drops straight
// into a checkout of it. Everything plays through the real game loop.

// Closes the tutorial, cards and panels until the UI reports nothing open.
const IDLE = `(() => { for (let i = 0; i < 12 && window.__HITL.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); })()`;
// Fast-forwards a real game with a bot through the sim alone until `until` holds or `weeks` pass;
// the bot then answers any open decision, unless `decision` names one to stop at and leave open.
const PLAY = ({ weeks, bot = 'balanced', until = 'false', after = '', decision = null }) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  const want = ${JSON.stringify(decision)};
  for (let i = 0; i < ${weeks} && !s.gameOver; i++) {
    if (${until}) break;
    if (want && s.pendingDecision?.eventId === want) break;
    b.botDecide('${bot}', s);
    b.botTurn('${bot}', s);
    sim.tick(s);
  }
  if (!want) b.botDecide('${bot}', s);
  ${after}
  ${IDLE};
})()`;
// Everyone back in the office, with recent Yak history shown.
const IN_OFFICE = 's.lockdown = null; s.workPolicy = "office"; for (const p of s.staff) { p.remote = false; p.call = null; } window.__HITL.emit((s.chatLog ?? []).slice(-15));';
// The side panels (top bar, tray, bottom bar, toasts) hidden; cards and captions stay.
const BARE = `(() => { const st = document.createElement('style'); st.textContent = '#ui .topbar, #ui .tray, #ui .bottom, #ui .toasts { display: none !important; }'; document.head.append(st); })()`;
// Closes unlock cards and tips as a player would, at each of these seconds. With escape false only
// their buttons are pressed, so a card that closes on Escape (the launch results) stays up.
const DISMISS = (times, { escape = true } = {}) => times.map((at) => ({ at, js: `(() => { for (let i = 0; i < 12; i++) { const b = [...document.querySelectorAll('button')].find((x) => x.getClientRects().length && ['Got it', 'Later', 'Next', 'Onward'].includes(x.textContent.trim())); if (b) b.click(); else if (${escape} && window.__HITL.clock.busy) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); else break; } })()` }));
// The HQ in the Agents era, well staffed.
const HQ = "s.office.stage === 2 && s.era.id === 'agents' && s.staff.length >= 28";
// A review-manifest item's staging (setup, actions, query, moment), to film it another way.
const from = (id) => { const it = REVIEW.find((x) => x.id === id); if (!it) throw new Error(`feature-media: no capture item ${id}`); const { setup, actions, query, moment, pre, warmup, seconds } = it; return { setup, actions: actions ?? [], query, moment, pre, warmup, seconds }; };
// Camera onto a staged prop whose name contains `name` (the first one up), or onto a staff member.
const FOCUS_PROP = (name, zoom) => `(() => { const R = window.__hitlRender; const p = R.props?.current?.().find((x) => x.prop.includes('${name}')); if (p) R.focusAt(p.obj.position.x, p.obj.position.z, ${zoom}); })()`;
// Camera onto the Waffle Party (its centre), or onto the first dancer of a music night.
const FOCUS_PARTY = (zoom) => `(() => { const R = window.__hitlRender; const c = R.incentives?.party?.center ?? R.incentivesFrame; if (c) R.focusAt(c.x, c.z, ${zoom}); })()`;
const FOCUS_DANCE = (zoom) => FOCUS_STAFF('(s) => { const id = window.__hitlRender.incentives?.dance?.dancers?.[0]; return id != null ? s.staff.find((p) => p.id === id) : null; }', zoom);
const FOCUS_STAFF = (pick, zoom) => `(() => { const R = window.__hitlRender, s = window.__HITL.state; const p = (${pick})(s); if (!p) return; let o = null; R.scene.traverse((x) => { if (x.userData.staffId === p.id) o = x.parent; }); if (o) { const v = o.getWorldPosition(new o.position.constructor()); R.focusAt(v.x, v.z, ${zoom}); } })()`;
// Bare, with Yak moved beside the office for a message thread.
const YAK_BARE = `(() => { const st = document.createElement('style'); st.textContent = '#ui .topbar, #ui .tray, #ui .menu, #ui .toasts { display: none !important; } #ui .chat.yak { position: fixed !important; left: auto !important; right: 40px !important; top: 120px !important; bottom: auto !important; width: 440px !important; }'; document.head.append(st); })()`;
// A key press as the UI hears it (decision choices are 1, 2, 3).
const KEY = (key) => `dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: 'Digit${key}', bubbles: true }))`;
// Clicks the first visible element matching a selector whose text contains `text` (any, when empty).
const CLICK_TEXT = (sel, text = '') => `(() => { const b = [...document.querySelectorAll('${sel}')].filter((x) => x.getClientRects().length && !x.disabled); (b.find((x) => x.textContent.toLowerCase().includes('${text}')) ?? b[0])?.click(); })()`;
const STILL = (name, from, crop) => ({ path: `img/${name}.webp`, size: '1280x720', from, crop });
// A 1280x720 loop with a 1280x720 poster, as the landing page's event loops are.
const LOOP = (name, from, seconds, crop, crf) => ({ path: `media/loops/${name}.mp4`, size: '1280x720', from, seconds, webm: true, poster: `img/loops/${name}.webp`, crop, ...(crf ? { crf, webmCrf: crf + 12 } : {}) });
// The middle of the frame, for a closer look than the camera's zoom allows.
const MIDDLE = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };

export const ITEMS = [
  {
    id: 'site-hero', title: 'Landing page hero: the HQ by day', query: 'seed=1&speed=1&time=day&zoom=0.85', still: true, hideUi: true,
    setup: PLAY({ weeks: 700, until: HQ, after: IN_OFFICE }), warmup: 4, screenshots: [3],
    out: [{ path: 'img/hero.webp', size: '1920x1080' }],
  },
  {
    // A slow pan across the HQ: the camera moves a little every frame, from the staff's centre.
    id: 'site-hero-loop', title: 'Landing page hero loop: a drift over the HQ', query: 'seed=1&speed=1&time=day&zoom=0.85', seconds: 15, hideUi: true,
    setup: PLAY({ weeks: 700, until: HQ, after: IN_OFFICE }), warmup: 4,
    actions: [
      { at: 0, js: `(() => { const R = window.__hitlRender, s = window.__HITL.state; let n = 0, x = 0, z = 0; R.scene.traverse((o) => { if (o.userData.staffId !== undefined) { const v = o.parent.getWorldPosition(new o.parent.position.constructor()); x += v.x; z += v.z; n++; } }); window.__drift = n ? { x: x / n, z: z / n } : { x: 0, z: 0 }; })()` },
      ...Array.from({ length: 15 * 30 }, (_, i) => ({ at: i / 30, js: `(() => { const d = window.__drift; if (d) window.__hitlRender.focusAt(d.x - 1.5 + ${(3 * i) / (15 * 30)}, d.z + 0.75 - ${(1.5 * i) / (15 * 30)}, 0.85); })()` })),
    ],
    out: [{ path: 'media/loops/hero.mp4', size: '1600x900', from: 0.5, seconds: 14, fps: 24, webm: true, xfade: 1, crf: 31, webmCrf: 44 }],
  },
  {
    id: 'site-floor', title: 'Landing page: the Office Floor', query: 'seed=1&speed=1&time=day', still: true, hideUi: true,
    setup: PLAY({ weeks: 400, until: 's.office.stage === 1 && s.staff.length >= 12', after: IN_OFFICE }), warmup: 4, screenshots: [3],
    out: [{ path: 'img/floor.webp', size: '1600x900' }],
  },
  {
    id: 'site-garage', title: 'Landing page: the garage', query: 'seed=1&speed=1&time=day', still: true, hideUi: true,
    setup: PLAY({ weeks: 2 }), warmup: 4, actions: DISMISS([0.1, 0.5, 1]), screenshots: [3],
    out: [{ path: 'img/garage.webp', size: '1600x900' }],
  },
  {
    id: 'site-hq-night', title: 'Landing page: the HQ at night', query: 'seed=1&speed=1&time=night&zoom=0.85', still: true, hideUi: true,
    setup: PLAY({ weeks: 700, until: HQ, after: IN_OFFICE }), warmup: 4, screenshots: [3],
    out: [{ path: 'img/hq-night.webp', size: '1600x900' }],
  },
  {
    id: 'site-lockdown', title: 'Landing page: lockdown, the call over the empty office', query: 'seed=1&speed=1', still: true,
    setup: PLAY({ weeks: 200, until: 's.lockdown' }), warmup: 3, actions: [{ at: 0, js: BARE }, ...DISMISS([0.2, 1, 2, 4])], screenshots: [6],
    out: [{ path: 'img/lockdown.webp', size: '1920x1080' }],
  },
  {
    id: 'site-launch', title: 'Landing page: launch day reviews', query: 'seed=33&speed=1&zoom=1.4',
    setup: PLAY({ weeks: 80, until: "s.projects.some((j) => j.kind === 'new' && j.progress / j.pointsNeeded > 0.9) && s.stats.launches === 0" }),
    actions: [{ at: 0, js: BARE }, ...DISMISS([0.1, 0.6, 1.5, 3, 6, 8, 11, 13, 20, 30], { escape: false }),
      { at: 9, js: `(() => { const H = window.__HITL; if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 1 }); })()` }],
    still: true, screenshots: [44],
    out: [{ path: 'img/launch.webp', size: '1920x1080', from: 44 }],
  },
  // Event loops: close on the moment, no UI.
  {
    ...from('2-5-era-arrival'), id: 'site-loop-era', title: 'Landing page loop: an era arrives', hideUi: true, seconds: 9,
    // From before the era turns, so the loop's blend back reads as the old era returning.
    out: [LOOP('era', 0.4, 6.1)],
  },
  {
    ...from('5-2-incident'), id: 'site-loop-incident', title: 'Landing page loop: an outage', hideUi: true, seconds: 12,
    out: [LOOP('incident', 1.8, 9.2)],
  },
  {
    ...from('5-4-waffle-party-real'), id: 'site-loop-waffle', title: 'Landing page loop: the Waffle Party', hideUi: true, seconds: 22,
    actions: [...from('5-4-waffle-party-real').actions, ...[8, 12, 16].map((at) => ({ at, js: FOCUS_PARTY(3.1) }))], screenshots: [10, 14, 18],
    out: [LOOP('waffle', 16.5, 4.2, MIDDLE, 28)],
  },
  {
    // Its cards are clicked through, so the UI stays (bare) instead of hidden.
    ...from('5-4b-music-night-real'), id: 'site-loop-music', title: 'Landing page loop: music night', seconds: 32,
    actions: [{ at: 0, js: BARE }, ...DISMISS(Array.from({ length: 28 }, (_, i) => i + 0.3)), ...from('5-4b-music-night-real').actions, ...Array.from({ length: 14 }, (_, i) => ({ at: 4 + 2 * i, js: FOCUS_DANCE(2.8) }))], screenshots: [8, 12, 16, 20, 24, 28],
    out: [LOOP('music', 23.5, 4.2, MIDDLE, 30)],
  },
  {
    id: 'site-loop-ransomware', title: 'Landing page loop: ransomware on every screen', moment: 'ransomware', query: 'speed=1', hideUi: true, seconds: 10, warmup: 2,
    actions: [{ at: 0.2, js: FOCUS_STAFF('(s) => s.staff.find((p) => p.assignment?.type === "project") ?? s.staff[0]', 3.2) }], screenshots: [2, 5, 8],
    out: [LOOP('ransomware', 2, 4.2, MIDDLE, 27)],
  },
  // New on the page: a Yak quick-post thread, the Office Space nods, and decisions you can see.
  {
    id: 'site-yak-post', title: 'Landing page: a quick post in Yak and the replies', query: 'seed=1&speed=1', still: true,
    setup: PLAY({ weeks: 40, after: IN_OFFICE }), warmup: 3,
    actions: [{ at: 0, js: YAK_BARE }, ...DISMISS([0.2, 0.6]), { at: 1, js: CLICK_TEXT('.ypost-btn') }, { at: 1.6, js: CLICK_TEXT('.ypost-opt', 'broke prod') },
      // Replies arrive a week or two later: play on, answering cards as they come.
      { at: 2, js: 'window.__HITL.setSpeed(2)' }, ...Array.from({ length: 38 }, (_, i) => ({ at: 2.5 + i, js: CLICK_TEXT('button.btn.go', 'nice') })), ...DISMISS(Array.from({ length: 38 }, (_, i) => 2.7 + i)),
      ...Array.from({ length: 38 }, (_, i) => ({ at: 2.9 + i, js: `(() => { const H = window.__HITL; if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 }); })()` }))],
    screenshots: [16, 24, 32, 40],
    // Yak sits top right; the crop keeps it with the office beside it.
    out: [STILL('yak-thread', 32, { x: 0.43, y: 0.04, w: 0.56, h: 0.56 })],
  },
  {
    ...from('nods-printer'), id: 'site-printer', title: 'Landing page loop: the printer taken out back', seconds: 25,
    actions: [{ at: 0, js: BARE }, ...from('nods-printer').actions], screenshots: [14, 16, 18, 20],
    // The smash happens left of centre; the crop keeps the printer and the bat.
    out: [LOOP('printer', 17, 4.2, { x: 0.34, y: 0.22, w: 0.55, h: 0.55 })],
  },
  {
    ...from('nods-stapler'), id: 'site-stapler', title: 'Landing page: the red stapler', still: true,
    actions: [{ at: 0, js: BARE }, ...from('nods-stapler').actions], screenshots: [3],
    out: [STILL('stapler', 3)],
  },
  {
    ...from('nods-cover-sheets'), id: 'site-cover-sheets', title: 'Landing page: the TPS cover sheets', still: true,
    actions: [{ at: 0, js: BARE }, ...from('nods-cover-sheets').actions], screenshots: [3],
    out: [STILL('cover-sheets', 3)],
  },
  {
    id: 'site-rival-sign', title: 'Landing page: the rival sign', query: 'seed=3&speed=1', seconds: 8, warmup: 0.5, still: true,
    setup: PLAY({ weeks: 130, bot: 'allHumans', decision: 'rival_jab' }),
    actions: [{ at: 0, js: BARE }, ...DISMISS([0.05, 0.3], { escape: false }), { at: 1, js: KEY('1') }, ...DISMISS([1.6, 2.4], { escape: false }), { at: 2.5, js: FOCUS_PROP('sign_rival', 3.2) }],
    screenshots: [5, 7],
    out: [STILL('rival-sign', 5)],
  },
  {
    id: 'site-cheque', title: 'Landing page: the giant novelty cheque', query: 'seed=1&speed=1', seconds: 8, warmup: 0.5, still: true,
    setup: PLAY({ weeks: 820, bot: 'allHumans', decision: 'ai_summit_hackathon' }),
    actions: [{ at: 0, js: BARE }, ...DISMISS([0.05, 0.3], { escape: false }), { at: 1, js: KEY('2') }, ...DISMISS([1.6, 2.4], { escape: false }), { at: 2.5, js: FOCUS_PROP('giant_cheque', 3.2) }],
    screenshots: [5, 7],
    out: [STILL('cheque', 5, MIDDLE)],
  },
  {
    id: 'site-whiteboard', title: 'Landing page: the whiteboard, the market has spoken', query: 'seed=1&speed=1', moment: 'pivot_pitch', seconds: 5, warmup: 0.5, still: true,
    actions: [{ at: 0, js: BARE }, ...DISMISS([0.05, 0.3], { escape: false }), { at: 0.1, js: FOCUS_PROP('whiteboard', 3.0) }],
    screenshots: [2, 4],
    out: [STILL('whiteboard', 2)],
  },
  {
    id: 'site-visitor', title: 'Landing page loop: the visitor, founders hiding', query: 'seed=1&speed=1', moment: 'first_user_test', seconds: 10, warmup: 0.5,
    actions: [{ at: 0, js: BARE }, ...DISMISS([0.05, 0.3], { escape: false }), { at: 0.1, js: FOCUS_PROP('visitor_chair', 2.8) }],
    screenshots: [2, 5, 8],
    out: [LOOP('visitor', 2, 5), STILL('visitor', 5)],
  },
];
