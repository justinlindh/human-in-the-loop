import { describe, it, expect } from 'vitest';
import { meaningSystem } from '../../src/sim/meaning.js';
import { economySystem, weeklyCosts } from '../../src/sim/economy.js';
import { productsSystem } from '../../src/sim/products.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addProduct, setItems } from './helpers.js';

const run = (s, sys, n) => { for (let i = 0; i < n; i++) { sys(makeCtx(s)); s.week++; } };
const plain = (s, over = {}) => addStaff(s, 'support', 'mid', { traits: [], meaning: 60, assignment: { type: 'support', targetId: null }, ...over });

describe('meaning has pressure at scale', () => {
  it('a plain worker drifts up in a small company and down in a big one', () => {
    const small = game();
    const a = plain(small);
    run(small, meaningSystem, 20);
    expect(a.meaning).toBeGreaterThan(60);
    const big = game();
    for (let i = 0; i < 28; i++) plain(big);
    const b = big.staff.at(-1);
    run(big, meaningSystem, 20);
    expect(b.meaning).toBeLessThan(60);
  });

  it('even a well-cared-for mentor settles below 100', () => {
    const s = game();
    s.policies = { pair: true, craft_fridays: true };
    const j = addStaff(s, 'engineer', 'junior', { traits: [] });
    const m = addStaff(s, 'engineer', 'senior', { traits: [], meaning: 80, assignment: { type: 'mentor', targetId: j.id } });
    for (let i = 0; i < 14; i++) plain(s);
    run(s, meaningSystem, 200);
    expect(m.meaning).toBeGreaterThan(70);
    expect(m.meaning).toBeLessThan(95);
  });
});

describe('costs scale with the company', () => {
  it('everyone gets a yearly raise', () => {
    const s = game();
    const p = s.staff[0];
    const salary = p.salary;
    s.week = 51;
    run(s, staffUpkeep, 1);
    expect(p.salary).toBe(Math.round((salary * (1 + B.yearlyRaise)) / 10) * 10);
    run(s, staffUpkeep, 10);
    expect(p.salary).toBe(Math.round((salary * (1 + B.yearlyRaise)) / 10) * 10);
  });

  it('headcount past twelve adds overhead', () => {
    const s = game();
    expect(weeklyCosts(s).overhead).toBe(0);
    for (let i = 0; i < 18; i++) plain(s);
    expect(weeklyCosts(s).overhead).toBeCloseTo((s.staff.length - B.overheadFreeHeadcount) * B.overheadPerHead);
  });
});

describe('products go stale', () => {
  it('a product with faded novelty churns faster than a fresh one', () => {
    const run1 = (novelty) => {
      const s = game();
      const p = addProduct(s, { customers: 10000, novelty });
      s.market.categories.email.incumbentStrength = 1e9;
      s.ops.maintenanceCapacity = 100;
      productsSystem(makeCtx(s));
      return p.customers;
    };
    expect(run1(0)).toBeLessThan(run1(10));
  });
});

describe('burnout still bites in a kitted-out office', () => {
  it('two maxed nap pods leave at least half the burnout resignation rate', () => {
    let quits = 0;
    const trials = 600;
    for (let seed = 1; seed <= trials; seed++) {
      const s = game(seed);
      s.officeStage = 2;
      setItems(s, [{ id: 'a', itemId: 'nap_pod', level: 3 }, { id: 'b', itemId: 'nap_pod', level: 3 }]);
      const p = addStaff(s, 'engineer', 'mid', { traits: [], meaning: 0, mood: 'burnout', burnoutWeeks: 5 });
      meaningSystem(makeCtx(s));
      if (!s.staff.includes(p)) quits++;
    }
    expect(quits / trials).toBeGreaterThan(B.resignChance.burnout * 0.5 * 0.6);
  });
});
