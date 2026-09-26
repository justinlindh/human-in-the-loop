import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { getActionTypes, getSystems } from '../../src/sim/registry.js';
import { createRng, pick, int, chance } from '../../src/sim/rng.js';
import { game, addStaff, addProduct } from './helpers.js';

function assertAllFinite(v, path) {
  if (typeof v === 'number') expect(Number.isFinite(v), path).toBe(true);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertAllFinite(x, `${path}.${k}`);
}

// Systems registered so far with the plan's order table.
const PLAN_ORDER = [
  ['calendar-start', 10], ['ladder', 11], ['standup', 12], ['purpose', 13], ['beats', 14], ['moonshot', 15], ['props', 16], ['work', 20], ['projects', 30], ['products', 40], ['marketing', 45], ['vacation', 48], ['strain', 49], ['meaning', 50], ['incentives', 51], ['move-on', 52], ['attrition', 53],
  ['knowledge', 55], ['market', 60], ['for-sale', 62], ['incidents', 65], ['events', 70], ['annual', 75], ['economy', 80],
  ['staff-upkeep', 85], ['unlocks', 86], ['goals', 87], ['chat', 88], ['prompts', 89], ['endgame', 90], ['posts', 91], ['history', 95], ['restage', 99],
];

function midGame(seed) {
  const s = game(seed);
  s.cash = 50000;
  addStaff(s, 'engineer', 'junior');
  addStaff(s, 'marketer', 'mid');
  addProduct(s, { customers: 2000 });
  dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotly', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' });
  for (let i = 0; i < 3; i++) tick(s);
  return s;
}

// Random payloads mixing real ids, junk ids, and odd values.
function randomAction(r, s, type) {
  const ids = () => [...s.staff.map((p) => p.id), ...s.candidates.map((c) => c.id), ...s.products.map((p) => p.id), ...s.projects.map((j) => j.id), 'nope', null, undefined, 42];
  const any = (arr) => pick(r, arr);
  const words = ['engineering', 'qa', 'vibes', 'content', 'conference', 'skywriting', 'pair', 'apprenticeship', 'nope', 'new', 'update', 'migration', 'refactor', 'craft', 'weird', 'small', 'large', 'huge', 'email', 'legal', 'agent', 'vertical', 'chatgbt', 'mistrale'];
  const assignTypes = ['project', 'maintenance', 'oversight', 'mentor', 'hardProblem', 'support', 'sabbatical', 'idle', 'napping'];
  return {
    type,
    candidateId: any(ids()), staffId: any(ids()), productId: any(ids()), projectId: any(ids()), targetId: any(ids()),
    assignment: chance(r, 0.9) ? { type: any(assignTypes), targetId: any(ids()) } : null,
    kind: any(words), name: any(['X', '', null]), category: any(words), angle: any(words), model: any(words), size: any(words),
    fn: any(words), level: any([0, 0.3, 1, 7, -1, 'lots', NaN]), id: any(words), on: chance(r, 0.5),
    channel: any(words), choice: int(r, -1, 3),
  };
}

describe('dispatch invariants', () => {
  it('every failed action leaves state byte-identical', () => {
    const types = getActionTypes();
    expect(types.length).toBeGreaterThan(5);
    let failures = 0;
    for (const seed of [1, 2, 3]) {
      const r = createRng(seed * 101);
      // Build each seed's mid-game once; every action gets a fresh copy of it.
      const base = JSON.stringify(midGame(seed));
      for (const type of types) {
        for (let i = 0; i < 60; i++) {
          const s = JSON.parse(base);
          if (chance(r, 0.3)) s.cash = int(r, -100, 3000);
          const before = JSON.stringify(s);
          const res = dispatch(s, randomAction(r, s, type));
          expect(typeof res.ok).toBe('boolean');
          expect(Array.isArray(res.events)).toBe(true);
          if (res.ok) assertAllFinite(s, `${type}`);
          if (!res.ok) {
            failures++;
            expect(typeof res.reason, type).toBe('string');
            expect(JSON.stringify(s), `${type}: ${res.reason}`).toBe(before);
          }
        }
      }
    }
    expect(failures).toBeGreaterThan(50);
  });

  it('after game over only resolveDecision is accepted', () => {
    const s = game();
    s.gameOver = { won: false, reason: 'runway', score: 0, epilogue: [] };
    const before = JSON.stringify(s);
    const res = dispatch(s, { type: 'hire', candidateId: s.candidates[0].id });
    expect(res).toEqual({ ok: false, reason: 'The run is over', events: [] });
    expect(JSON.stringify(s)).toBe(before);
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 }).reason).not.toBe('The run is over');
  });
});

describe('system order', () => {
  it('registered systems match the plan order table', () => {
    const plan = Object.fromEntries(PLAN_ORDER);
    const got = getSystems().map((x) => [x.name, x.order]);
    for (const [name, order] of got) expect(plan[name], name).toBe(order);
    expect(got.map(([, o]) => o)).toEqual([...got.map(([, o]) => o)].sort((a, b) => a - b));
    expect(got.map(([n]) => n)).toEqual(['calendar-start', 'ladder', 'standup', 'purpose', 'beats', 'moonshot', 'props', 'work', 'projects', 'products', 'marketing', 'vacation', 'strain', 'meaning', 'incentives', 'move-on', 'attrition', 'knowledge', 'market', 'for-sale', 'incidents', 'events', 'annual', 'economy', 'staff-upkeep', 'unlocks', 'goals', 'chat', 'prompts', 'endgame', 'posts', 'history', 'restage']);
  });
});
