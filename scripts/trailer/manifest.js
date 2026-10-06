// The capture manifest for the trailer: the items its beats name, with each beat's overrides.
// A beat's `item` is an id from scripts/capture-manifest.js or scripts/feature-media/manifest.js, or one
// of the trailer's own items below.
// Item ids are prefixed `trailer-<beat>` so their files never collide with review captures.
// A beat's `camera` list adds zooms ({ at, zoom } multiplies the current zoom, eased by the camera
// rig) and its `actions` list adds page JS, both on the clip's own clock.
import { ITEMS, BARE, NO_SAY } from '../capture-manifest.js';
import { ITEMS as FEATURE_MEDIA } from '../feature-media/manifest.js';
import { beatAssertions } from './assertions.js';
import { BEATS, DEFERRED_CAPTURES } from './config.js';
import { LOAD_PIN } from './pins.js';

// Closes unlock and "new things to place" cards each second, as a player would; era and launch
// cards (Onward, Nice!) stay up.
const CLOSE_CARDS = Array.from({ length: 14 }, (_, i) => ({ at: 0.2 + i, js: "[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && ['Got it', 'Later'].includes(b.textContent.trim())).forEach((b) => b.click())" }));

// What the launch beat does once its pin has loaded: keeps only the hit's project and hides the overlays.
const LAUNCH_SETUP = `(async () => { const sim = await import('/src/sim/index.js'); const s = window.__HITL.state, c = structuredClone(s); const ev = sim.tick(c); const p = c.products.find((p) => p.version === 1 && p.score >= 9 && ev.some((e) => e.type === 'launch' && e.productId === p.id)); if (!p || c.office.stage !== 1) throw new Error('trailer: no first-version hit on the Office Floor'); s.projects = s.projects.filter((j) => j.kind === 'new' && j.name === p.name); ${BARE}; ${NO_SAY}; })()`;

const OWN = [
  // The first launch on the Office Floor, opened on its pin (config.js PIN_SOURCES); the game's own tick raises the launch.
  { ...ITEMS.find((i) => i.id === 'trail-launch'), id: 'real-launch', query: 'seed=1&speed=1', setup: LAUNCH_SETUP },
  // An era arriving, with its card and the office dressed for it. Each beat names its pin (config.js PIN_SOURCES).
  { id: 'real-era', title: 'An era arriving in a real game', query: 'seed=1&speed=1', seconds: 14, actions: CLOSE_CARDS },
];

const byId = new Map([...ITEMS, ...FEATURE_MEDIA, ...OWN].map((it) => [it.id, it]));

// The camera rig zooms by exp(-deltaY * 0.0015) per wheel event.
const ZOOM = (factor) => `document.getElementById('scene').dispatchEvent(new WheelEvent('wheel', { deltaY: ${(-Math.log(factor) / 0.0015).toFixed(1)}, cancelable: true }))`;

const items = [...BEATS, ...DEFERRED_CAPTURES].filter((b) => b.item).map((b) => {
  const base = byId.get(b.item);
  if (!base) throw new Error(`trailer: beat ${b.id} names unknown capture item ${b.item}`);
  const { group, out, record, ...rest } = base;
  const item = { ...rest, ...b.capture, id: `trailer-${b.id}`, title: `Trailer: ${b.id} (${base.title})` };
  // A `pin` opens the beat on a saved state (scripts/trailer/pins.js) in place of the item's indexed moment.
  if (item.pin) {
    item.setup = `(async () => { await ${LOAD_PIN(item.pin)}; ${item.setup ? `await ${item.setup};` : ''} })()`;
    delete item.moment; delete item.pre; delete item.pin;
  }
  const extra = [...(b.camera ?? []).map((c) => ({ at: c.at, js: ZOOM(c.zoom) })), ...(b.actions ?? [])];
  if (extra.length) item.actions = [...(item.actions ?? []), ...extra];
  item.actions = [...(item.actions ?? []), ...beatAssertions(b)];
  item.screenshots = [...new Set([...(item.screenshots ?? []), b.from, b.from + b.dur - 1 / 30])];
  return item;
});

export { items as ITEMS };
