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
