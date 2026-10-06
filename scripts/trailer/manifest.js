// The capture manifest for the trailer: the items its beats name, with each beat's overrides.
// A beat's `item` is an id from scripts/capture-manifest.js or scripts/feature-media/manifest.js, or one
// of the trailer's own items below.
// Item ids are prefixed `trailer-<beat>` so their files never collide with review captures.
// A beat's `camera` list adds zooms ({ at, zoom } multiplies the current zoom, eased by the camera
// rig) and its `actions` list adds page JS, both on the clip's own clock.
import { ITEMS } from '../capture-manifest.js';
import { ITEMS as FEATURE_MEDIA } from '../feature-media/manifest.js';
import { beatAssertions } from './assertions.js';
import { BEATS, DEFERRED_CAPTURES } from './config.js';
import { LOAD_PIN } from './pins.js';

// Closes unlock and "new things to place" cards each second, as a player would; era and launch
// cards (Onward, Nice!) stay up.
const CLOSE_CARDS = Array.from({ length: 14 }, (_, i) => ({ at: 0.2 + i, js: "[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && ['Got it', 'Later'].includes(b.textContent.trim())).forEach((b) => b.click())" }));

// The first seed (from `seeds`) whose game, played headlessly with the same bot and staging as
// BEFORE_EVENT, raises a matching event after minWeeks. With `clean` the week has no decision and no
// other launch on top; with `first` only the first matching week of each game counts.
// The sim is pure and deterministic, so the page replays exactly this game.
async function firstSeed({ match, weeks, minWeeks = 0, clean = false, first = false, seeds }) {
  const sim = await import('../../src/sim/index.js');
  const b = await import('../../src/sim/bots.js');
  const test = new Function(`return ${match}`)();
  for (const seed of seeds) {
    const s = sim.createGame({ seed });
    for (let i = 0; i < weeks && !s.gameOver; i++) {
      b.botDecide('balanced', s);
      b.botTurn('balanced', s);
      s.lockdown = null; s.workPolicy = 'office'; for (const p of s.staff) { p.remote = false; p.call = null; }
      const ev = sim.tick(s) ?? [];
      if (i < minWeeks || !ev.some(e => test(e, s))) continue;
      if (!clean || (!s.pendingDecision && !ev.some((e) => e.type === 'launch' && !test(e, s)))) return seed;
      if (first) break;
    }
  }
  throw new Error(`trailer: no seed in ${seeds[0]}..${seeds.at(-1)} reaches ${match}`);
}

const FLOOR_HIT = "(e, s) => s.office.stage === 1 && e.type === 'launch' && s.products.some(p => p.id === e.productId && p.version === 1 && p.score >= 9)";
const FLOOR_SEED = await firstSeed({ match: FLOOR_HIT, weeks: 400, seeds: Array.from({ length: 80 }, (_, i) => i + 1) });

const OWN = [
  { ...ITEMS.find(i => i.id === 'trail-launch'), query: `seed=${FLOOR_SEED}&speed=1` },
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
