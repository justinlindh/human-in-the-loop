// The capture manifest for the trailer: the items its beats name, with each beat's overrides.
// A beat's `item` is an id from scripts/capture-manifest.js or scripts/feature-media/manifest.js, or one
// of the trailer's own items below.
// Item ids are prefixed `trailer-<beat>` so their files never collide with review captures.
// A beat's `camera` list adds zooms ({ at, zoom } multiplies the current zoom, eased by the camera
// rig) and its `actions` list adds page JS, both on the clip's own clock.
import { ITEMS } from '../capture-manifest.js';
import { ITEMS as FEATURE_MEDIA } from '../feature-media/manifest.js';
import { BEATS, DEFERRED_CAPTURES } from './config.js';

// Plays a real game with the balanced bot until the next week would raise an event matching `match`
// (a JS predicate on e), checked on a copy of the state so the game itself stops the week before.
// The first live week then presents the event on camera, about one week (8 s at speed 1) in.
const BEFORE_EVENT = ({ match, weeks, minWeeks = 0, clean = false, first = false }) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  const match = ${match};
  // Everyone is staged in the office each week, before the look-ahead, so the live week plays out
  // exactly as the checked copy did.
  const inOffice = () => { s.lockdown = null; s.workPolicy = 'office'; for (const p of s.staff) { p.remote = false; p.call = null; } };
  let found = false;
  for (let i = 0; i < ${weeks} && !s.gameOver; i++) {
    b.botDecide('balanced', s);
    b.botTurn('balanced', s);
    inOffice();
    if (i >= ${minWeeks}) {
      // The same test as firstSeed: the event, and when clean, no decision or other launch on top.
      // With first, only the first matching week counts.
      const ahead = structuredClone(s);
      const ev = sim.tick(ahead) ?? [];
      const hit = ev.some(e => match(e, ahead));
      const isClean = !ahead.pendingDecision && !ev.some((e) => e.type === 'launch' && !match(e, ahead));
      if (hit && (!${clean} || isClean)) { found = true; break; }
      if (hit && ${first}) break;
    }
    sim.tick(s);
  }
  // A console error fails the capture, so a seed that no longer reaches its event stops the build.
  if (!found) console.error('trailer: the seeded game never reached its event; pick another seed');
  window.__HITL.emit((s.chatLog ?? []).slice(-15));
  for (let i = 0; i < 12 && window.__HITL.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
})()`;

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

const AGENT_INCIDENT = "(e) => e.type === 'incident' && !e.caught && ['db_wipe', 'runaway_spend', 'mass_email', 'pricing_rewrite', 'refund_hallucination', 'prompt_injection_leak'].includes(e.kind)";
const INCIDENT_SEED = await firstSeed({ match: AGENT_INCIDENT, weeks: 1000, minWeeks: 300, clean: true, seeds: Array.from({ length: 80 }, (_, i) => i + 1) });

const FIRST_LAUNCH = "(e) => e.type === 'launch'";
const LAUNCH_SEED = await firstSeed({ match: FIRST_LAUNCH, weeks: 300, clean: true, first: true, seeds: Array.from({ length: 80 }, (_, i) => i + 1) });

const FLOOR_HIT = "(e, s) => s.office.stage === 1 && e.type === 'launch' && s.products.some(p => p.id === e.productId && p.version === 1 && p.score >= 9)";
const FLOOR_SEED = await firstSeed({ match: FLOOR_HIT, weeks: 400, seeds: Array.from({ length: 80 }, (_, i) => i + 1) });

const OWN = [
  { ...ITEMS.find(i => i.id === 'trail-launch'), query: `seed=${FLOOR_SEED}&speed=1` },
  {
    // The first product launch in a real game, with its reviews and nothing else on screen.
    id: 'real-first-launch', title: 'The first launch in a real game', query: `seed=${LAUNCH_SEED}&speed=1`, seconds: 14,
    setup: BEFORE_EVENT({ match: FIRST_LAUNCH, weeks: 300, clean: true, first: true }),
    actions: CLOSE_CARDS,
  },
  {
    // An agent-era incident in a real game: an agent breaks something, nobody catches it.
    id: 'real-incident', title: 'A real uncaught agent incident', query: `seed=${INCIDENT_SEED}&speed=1`, seconds: 14,
    setup: BEFORE_EVENT({ match: AGENT_INCIDENT, weeks: 1000, minWeeks: 300, clean: true }),
    actions: CLOSE_CARDS,
  },
  // Each era arriving in a real game, with its card and the office dressed for it.
  ...['chatgbt', 'agents', 'consolidation', 'plateau'].map((era) => ({
    id: `real-era-${era}`, title: `The ${era} era arriving in a real game`, query: 'seed=1&speed=1', seconds: 12,
    setup: BEFORE_EVENT({ match: `(e) => e.type === 'era' && e.eraId === '${era}'`, weeks: 1000 }),
    actions: CLOSE_CARDS,
  })),
];

const byId = new Map([...ITEMS, ...FEATURE_MEDIA, ...OWN].map((it) => [it.id, it]));

// The camera rig zooms by exp(-deltaY * 0.0015) per wheel event.
const ZOOM = (factor) => `document.getElementById('scene').dispatchEvent(new WheelEvent('wheel', { deltaY: ${(-Math.log(factor) / 0.0015).toFixed(1)}, cancelable: true }))`;

const items = [...BEATS, ...DEFERRED_CAPTURES].filter((b) => b.item).map((b) => {
  const base = byId.get(b.item);
  if (!base) throw new Error(`trailer: beat ${b.id} names unknown capture item ${b.item}`);
  const { group, out, record, ...rest } = base;
  const item = { ...rest, ...b.capture, id: `trailer-${b.id}`, title: `Trailer: ${b.id} (${base.title})` };
  const extra = [...(b.camera ?? []).map((c) => ({ at: c.at, js: ZOOM(c.zoom) })), ...(b.actions ?? [])];
  if (extra.length) item.actions = [...(item.actions ?? []), ...extra];
  return item;
});

export { items as ITEMS };
