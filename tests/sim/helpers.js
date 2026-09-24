import { createGame } from '../../src/sim/index.js';
import { generateStaff } from '../../src/sim/staff.js';
import { findSpot, assignSeats } from '../../src/sim/office.js';
import { offerPaths } from '../../src/sim/progression.js';
import { ANGLES } from '../../src/data/angles.js';
import { UNLOCK_KEYS } from '../../src/data/unlocks.js';

// A fresh run exactly as a player starts it: Classic era, nothing unlocked.
export const classicGame = (seed = 1) => createGame({ seed, companyName: 'Loopworks' });

// The whole toolbox at week 0: Agents era, every system and angle open, every model released,
// four desks in the garage, the policies that have no growth trigger of their own, and every goal already met (so rewards
// never land in the middle of a mechanics test). Mechanics tests start here.
export function openEverything(s) {
  s.era = { id: 'agents', since: 0 };
  for (const k of UNLOCK_KEYS) s.unlocks[k] = 0;
  offerPaths(s);
  for (const id of ['daily_standups', 'async_standups', 'pair', 'craft_fridays']) s.unlocks[`policy.${id}`] = 0;
  // Mistrale stays unreleased so tests can reach for a model that is not out yet.
  for (const [id, m] of Object.entries(s.models)) m.available = id !== 'mistrale';
  for (const g of Object.values(s.goals)) Object.assign(g, { done: true, week: 0 });
  s.market.unlockedAngles = Object.keys(ANGLES).filter((a) => ANGLES[a].era !== 'consolidation');
  addDesks(s, 4);
  return s;
}

export const game = (seed = 1) => openEverything(classicGame(seed));

// Meets every office-stage gate (week, launches, live products, people, brand) so upgradeOffice only
// depends on cash.
export function passOfficeGates(s) {
  s.week = Math.max(s.week, 260);
  s.stats.launches = Math.max(s.stats.launches, 3);
  s.brand = Math.max(s.brand, 40);
  while (s.products.filter((p) => !p.killed).length < 3) addProduct(s, { name: `Filler ${s.products.length}` });
  s.products.find((p) => !p.killed).mrr = Math.max(s.products.find((p) => !p.killed).mrr, 600000);
  while (s.staff.length < 12) addStaff(s, 'engineer', 'mid');
  return s;
}

// Places n free desk sets wherever they fit on the current stage.
export function addDesks(s, n) {
  for (let i = 0; i < n; i++) {
    const spot = findSpot(s.officeStage, s.office.placed, 'desk', [0, 2, 1, 3]);
    if (!spot) throw new Error('no room for a desk');
    s.office.placed.push({ id: `d${s.nextId++}`, itemId: 'desk', level: 1, ...spot });
  }
  assignSeats(s);
  return s;
}

// A placeItem action for the first free spot.
export const placeAction = (s, itemId) => ({ type: 'placeItem', itemId, ...findSpot(s.officeStage, s.office.placed, itemId) });

// Adds a placed item for free, off in its own row so it touches nothing. For effect tests.
export function withItem(s, itemId, level = 1) {
  s.office.placed.push({ id: `i${s.nextId++}`, itemId, level, x: 0, y: 100 + s.office.placed.length * 4, rot: 0 });
  return s;
}

// Replaces every non-desk item with the given list (each placed apart from the rest).
export function setItems(s, list) {
  s.office.placed = s.office.placed.filter((p) => p.itemId === 'desk');
  for (const it of list) withItem(s, it.itemId, it.level);
  return s;
}

// Adds a generated person to staff with optional overrides and returns them.
export function addStaff(state, role, seniority, over = {}) {
  const p = generateStaff(state, { role, seniority });
  Object.assign(p, over);
  state.staff.push(p);
  assignSeats(state);
  return p;
}

export const snapshot = (s) => JSON.stringify(s);

export function expectFail(expect, dispatch, state, action, reason) {
  const before = snapshot(state);
  const res = dispatch(state, action);
  expect(res.ok).toBe(false);
  if (reason) expect(res.reason).toBe(reason);
  expect(snapshot(state)).toBe(before);
  return res;
}

// Adds a live product directly to state with sensible defaults.
export function addProduct(state, over = {}) {
  const p = {
    id: `p${state.nextId++}`, name: 'Inboxer', category: 'email', angle: 'summarizer', model: 'chatgbt', modelVersion: 1,
    version: 1, size: 'small', stats: { features: 150, polish: 100, reliability: 100, novelty: 50 }, score: 7,
    reviews: [], customers: 0, mrr: 0, hype: 0, novelty: 5, health: 90, baseHealth: 90, uptime: 1,
    launchedWeek: state.week, copyAtWeek: state.week + 40, copied: false, wrapperHit: false, ownerId: null,
    migrationDueWeek: null, killed: false, ...over,
  };
  state.products.push(p);
  return p;
}

// Ticks n weeks, resolving any decision with its first choice that the sim accepts.
export function advance(state, n, tickFn, dispatchFn) {
  for (let i = 0; i < n && !state.gameOver; i++) {
    for (let c = 0; state.pendingDecision && c < 4; c++) dispatchFn(state, { type: 'resolveDecision', choice: c });
    tickFn(state);
  }
  return state;
}

// Runs fn with the everyday meaning grind switched off, for tests that measure exact drain or recovery ratios.
export function withoutGrind(B, fn) {
  const saved = [B.meaningGrind, B.meaningGrindPerHead];
  B.meaningGrind = 0;
  B.meaningGrindPerHead = 0;
  try { return fn(); } finally { [B.meaningGrind, B.meaningGrindPerHead] = saved; }
}
