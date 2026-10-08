// Capture items for the first-person clips (epic #1810). Every clip opens on the launch pin (a seeded Office
// Floor game), clears the cards, and drives the game's own controls: the person card's "See as" button, the
// Walk button, WASD, and Exit.
import { PIN_PACING, CLEAR_CARDS, CLICK, KEY, CAMLOG, FITTED_VIEW } from '../../capture-manifest.js';
import { LOAD_PIN } from '../../trailer/pins.js';

const OPEN = (pin = 'launch') => `(async () => { ${PIN_PACING} await ${LOAD_PIN(pin)}; ${CLEAR_CARDS}; window.__HITL.setSpeed(1); })()`;
const NO_PANELS = `(() => { const st = document.createElement('style'); st.textContent = '#ui .toasts, #ui .tray, #ui .tray-toggle, #ui .chat.yak, #ui .camhint { display: none !important; }'; document.head.append(st); })()`;
const CARDS_AWAY = Array.from({ length: 24 }, (_, i) => ({ at: i + 0.2, js: CLEAR_CARDS }));

// Presses and releases a key code on the window, as a keyboard would.
const DOWN = (code) => `dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, key: ${JSON.stringify(code)}, bubbles: true, cancelable: true }))`;
const UP = (code) => `dispatchEvent(new KeyboardEvent('keyup', { code: ${JSON.stringify(code)}, key: ${JSON.stringify(code)}, bubbles: true }))`;
const HOLD = (code, from, to) => [{ at: from, js: DOWN(code) }, { at: to, js: UP(code) }];
// Mouse look: `yaw` radians turned per second over [from, to], sent every frame through the game's own input hook.
const LOOK = (yawPerS, pitchPerS, from, to, fps = 30) => Array.from({ length: Math.round((to - from) * fps) }, (_, i) => ({
  at: +(from + i / fps).toFixed(3), js: `window.__hitlRender.firstPerson.input({ moveX: 0, moveZ: 0, yaw: ${yawPerS / fps}, pitch: ${pitchPerS / fps} })` }));

// Someone to ride along with: the first person whose animation matches, remembered on the page.
const PICK = (re) => `(() => { const R = window.__hitlRender, s = window.__HITL.state, re = ${re};
  const p = s.staff.find((x) => re.test(R.probe(x.id)?.anim ?? '')); if (p) window.__who = p.id; else console.error('capture: nobody matches ' + re); })()`;
// Every 0.25 s from `from` to `to`: the first time someone matches, opens their card and presses "See as".
const SEE_WHEN = (re, from, to) => Array.from({ length: Math.round((to - from) * 4) }, (_, i) => ({ at: from + i / 4, js: `(() => {
  if (window.__entered) return;
  const R = window.__hitlRender, re = ${re}, p = window.__HITL.state.staff.find((x) => re.test(R.probe(x.id)?.anim ?? ''));
  if (!p) return;
  window.__HITL_UI.openStaff(p.id);
  const b = [...document.querySelectorAll('.seeas')].find((x) => x.getClientRects().length);
  if (b) { b.click(); window.__entered = p.id; }
})()` }));

const shot = (id, title, extra) => ({ id, title, query: 'seed=9&speed=1', setup: OPEN(), ...extra });

export const ITEMS = [
  shot('fp-seeas-walk', 'First person: see as someone walking', {
    seconds: 11, warmup: 15, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
    actions: [...CARDS_AWAY, ...SEE_WHEN('/^walk/', 1.2, 4.2), ...CAMLOG(11)],
    screenshots: [3, 6, 9],
  }),
  shot('fp-seeas-work', 'First person: see as someone working', {
    seconds: 6.5, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
    actions: [...CARDS_AWAY, ...SEE_WHEN('/^typing/', 1, 2), ...CAMLOG(7)],
    screenshots: [3, 6],
  }),
  shot('fp-walk-desktop', 'First person: walk on desktop', {
    seconds: 12, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
    actions: [...CARDS_AWAY, { at: 1, js: CLICK('Walk') },
      ...HOLD('KeyW', 2, 5), ...LOOK(0.6, 0, 5, 7.5), ...HOLD('KeyW', 6, 9), ...HOLD('KeyA', 9, 10), { at: 11, js: KEY('Escape', 'Escape') }, ...CAMLOG(12)],
    screenshots: [2.5, 5, 8, 10],
  }),
  shot('fp-enter-exit', 'First person: enter and exit', {
    seconds: 10, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
    actions: [...CARDS_AWAY, { at: 1.5, js: CLICK('Walk') }, ...HOLD('KeyW', 3, 5.5), { at: 7, js: CLICK('Exit') }, ...CAMLOG(10)],
    screenshots: [1, 3, 5.5, 8.5],
  }),
];

// An eased push from the whole office in to one person at their desk, then "See as" from there.
const AT_WHO = `(() => { const R = window.__hitlRender; let o = null; R.scene.traverse((x) => { if (x.userData.staffId === window.__who) o = x.parent; }); if (!o) return { x: 0, z: 0 }; const v = o.getWorldPosition(new o.position.constructor()); return { x: v.x, z: v.z }; })()`;
ITEMS.push(shot('fp-transition', 'First person: push in, then see as', {
  seconds: 10, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
  camera: [{ at: 0, target: { js: FITTED_VIEW }, zoom: 1.05 }, { at: 4.5, target: { js: AT_WHO }, zoom: 3.2, ease: 'inOut' }],
  actions: [...CARDS_AWAY, { at: 0.1, js: PICK('/^typing/') }, ...SEE_WHEN('/^typing/', 5.4, 5.6), ...CAMLOG(10)],
  screenshots: [1, 3, 5, 7],
}));

// A thumb on the touch layer: a pointer event of type touch at (x, y).
const TOUCH = (type, id, x, y) => `(() => { const el = document.querySelector('.fp-touch'); if (!el) return; el.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerId: ${id}, pointerType: 'touch', isPrimary: ${id === 1}, clientX: ${x}, clientY: ${y}, bubbles: true })); })()`;
// Holds the stick (left thumb) pushed up, and drags the right thumb across to look, in steps.
const STICK = (from, to) => [{ at: from, js: TOUCH('pointerdown', 1, 150, 1000) },
  ...Array.from({ length: 6 }, (_, i) => ({ at: from + 0.1 * (i + 1), js: TOUCH('pointermove', 1, 150, 1000 - 14 * (i + 1)) })), { at: to, js: TOUCH('pointerup', 1, 150, 916) }];
const DRAG = (from, to, fps = 30) => [{ at: from, js: TOUCH('pointerdown', 2, 600, 600) },
  ...Array.from({ length: Math.round((to - from) * fps) }, (_, i) => ({ at: +(from + (i + 1) / fps).toFixed(3), js: TOUCH('pointermove', 2, 600 + 3 * (i + 1), 600) })), { at: to + 0.05, js: TOUCH('pointerup', 2, 700, 600) }];
ITEMS.push(shot('fp-walk-ipad', 'First person: walk on an iPad in portrait', {
  size: '820x1180', touch: true, seconds: 12, setup: `(async () => { await ${OPEN()}; ${NO_PANELS}; })()`,
  actions: [...CARDS_AWAY, { at: 1, js: CLICK('Walk') }, ...STICK(2, 6), ...DRAG(6, 8), ...STICK(8.2, 10.5), { at: 11, js: CLICK('Exit') }, ...CAMLOG(12)],
  screenshots: [2.5, 4, 7, 9.5],
}));
