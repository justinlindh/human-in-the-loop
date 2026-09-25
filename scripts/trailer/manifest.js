// The capture manifest for the trailer: the items its beats name, with each beat's overrides.
// A beat's `item` is an id from scripts/capture-manifest.js, or one of the trailer's own items below.
// Item ids are prefixed `trailer-<beat>` so their files never collide with review captures.
// A beat's `camera` list adds zooms ({ at, zoom } multiplies the current zoom, eased by the camera
// rig) and its `actions` list adds page JS, both on the clip's own clock.
import { ITEMS } from '../capture-manifest.js';
import { BEATS } from './config.js';

// Plays a real game with the balanced bot until the next week would raise an event matching `match`
// (a JS predicate on e), checked on a copy of the state so the game itself stops the week before.
// The first live week then presents the event on camera, about one week (8 s at speed 1) in.
const BEFORE_EVENT = ({ match, weeks, minWeeks = 0 }) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  const match = ${match};
  // Everyone is staged in the office each week, before the look-ahead, so the live week plays out
  // exactly as the checked copy did.
  const inOffice = () => { s.lockdown = null; s.workPolicy = 'office'; for (const p of s.staff) { p.remote = false; p.call = null; } };
  for (let i = 0; i < ${weeks} && !s.gameOver; i++) {
    b.botDecide('balanced', s);
    b.botTurn('balanced', s);
    inOffice();
    if (i >= ${minWeeks} && (sim.tick(structuredClone(s)) ?? []).some(match)) break;
    sim.tick(s);
  }
  window.__HITL.emit((s.chatLog ?? []).slice(-15));
  for (let i = 0; i < 12 && window.__HITL.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
})()`;

// Closes unlock and "new things to place" cards each second, as a player would; era and launch
// cards (Onward, Nice!) stay up.
const CLOSE_CARDS = Array.from({ length: 14 }, (_, i) => ({ at: 0.2 + i, js: "[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && ['Got it', 'Later'].includes(b.textContent.trim())).forEach((b) => b.click())" }));

const OWN = [
  {
    // An agent-era incident in a real game: an agent breaks something, nobody catches it.
    id: 'real-incident', title: 'A real uncaught agent incident', query: 'seed=20&speed=1', seconds: 14,
    setup: BEFORE_EVENT({ match: "(e) => e.type === 'incident' && !e.caught && ['db_wipe', 'runaway_spend', 'mass_email', 'pricing_rewrite', 'refund_hallucination', 'prompt_injection_leak'].includes(e.kind)", weeks: 900, minWeeks: 300 }),
    actions: CLOSE_CARDS,
  },
  {
    // The Agents era arriving in a real game, card and all.
    id: 'real-era', title: 'The Agents era arriving in a real game', query: 'seed=1&speed=1', seconds: 14,
    setup: BEFORE_EVENT({ match: "(e) => e.type === 'era' && e.eraId === 'agents'", weeks: 900 }),
    actions: CLOSE_CARDS,
  },
];

const byId = new Map([...ITEMS, ...OWN].map((it) => [it.id, it]));

// The camera rig zooms by exp(-deltaY * 0.0015) per wheel event.
const ZOOM = (factor) => `document.getElementById('scene').dispatchEvent(new WheelEvent('wheel', { deltaY: ${(-Math.log(factor) / 0.0015).toFixed(1)}, cancelable: true }))`;

const items = BEATS.filter((b) => b.item).map((b) => {
  const base = byId.get(b.item);
  if (!base) throw new Error(`trailer: beat ${b.id} names unknown capture item ${b.item}`);
  const { group, ...rest } = base;
  const item = { ...rest, ...b.capture, id: `trailer-${b.id}`, title: `Trailer: ${b.id} (${base.title})` };
  const extra = [...(b.camera ?? []).map((c) => ({ at: c.at, js: ZOOM(c.zoom) })), ...(b.actions ?? [])];
  if (extra.length) item.actions = [...(item.actions ?? []), ...extra];
  return item;
});

export { items as ITEMS };
