import { createGame } from '../../src/sim/index.js';
import { generateStaff } from '../../src/sim/staff.js';

export const game = (seed = 1) => createGame({ seed, companyName: 'Loopworks' });

// Adds a generated person to staff with optional overrides and returns them.
export function addStaff(state, role, seniority, over = {}) {
  const p = generateStaff(state, { role, seniority });
  Object.assign(p, over);
  state.staff.push(p);
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
