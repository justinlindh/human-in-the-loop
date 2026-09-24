import { describe, it, expect } from 'vitest';
import { productAppeal, categoryShare, marketSize } from '../../src/sim/products.js';
import { marketSystem } from '../../src/sim/market.js';
import { generateStaff } from '../../src/sim/staff.js';
import { institutionalKnowledge } from '../../src/sim/knowledge.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { game, addProduct } from './helpers.js';

describe('market shape', () => {
  it('the AI market grows from a fraction to full size over the early years', () => {
    const s = game();
    const y0 = marketSize(s, 'email');
    expect(y0).toBeLessThan(CATEGORIES.email.tam * 0.5);
    s.week = 52 * 10;
    expect(marketSize(s, 'email')).toBeCloseTo(CATEGORIES.email.tam * B.marketScale);
    expect(marketSize(s, 'email')).toBeCloseTo(y0 / B.adoptionStart);
  });

  it('bigger products reach more of the market', () => {
    const s = game();
    const small = addProduct(s, { size: 'small' });
    const large = addProduct(s, { size: 'large', category: 'notes' });
    const largeEmail = { ...large, category: 'email' };
    expect(productAppeal(s, largeEmail)).toBeGreaterThan(productAppeal(s, small));
  });

  it('a great product can out-share a weakened incumbent', () => {
    const s = game();
    s.week = 52 * 8;
    s.brand = 90;
    const p = addProduct(s, { score: 9.5, novelty: 8, category: 'support', angle: 'agent', size: 'large' });
    s.market.categories.support.incumbentStrength *= 0.5;
    const share = categoryShare(s, p);
    expect(share.mine).toBeGreaterThan(share.incumbent);
  });

  it('an incumbent erodes while you hold a great product for over a year', () => {
    const s = game();
    const p = addProduct(s, { score: B.erosionScore + 0.5, launchedWeek: 0, copyAtWeek: 1e6 });
    const before = s.market.categories.email.incumbentStrength;
    s.week = 30;
    marketSystem(makeCtx(s));
    expect(s.market.categories.email.incumbentStrength).toBe(before);
    s.week = 60;
    for (let i = 0; i < 52; i++) { marketSystem(makeCtx(s)); s.week++; }
    expect(s.market.categories.email.incumbentStrength).toBeCloseTo(before * (1 - B.incumbentErosion) ** 52);
    p.score = B.erosionScore - 0.5;
    const mid = s.market.categories.email.incumbentStrength;
    marketSystem(makeCtx(s));
    expect(s.market.categories.email.incumbentStrength).toBe(mid);
  });
});

describe('people shape', () => {
  it('candidates get more skilled as the years pass', () => {
    const avgSkill = (week) => {
      const s = game(3);
      s.week = week;
      let t = 0;
      for (let i = 0; i < 200; i++) t += Object.values(generateStaff(s, { role: 'engineer', seniority: 'mid' }).skills).reduce((a, b) => a + b, 0);
      return t / 200;
    };
    expect(avgSkill(52 * 10)).toBeGreaterThan(avgSkill(0) + 20);
  });

  it('founders hold about half the institutional knowledge with one product and about a third with three', () => {
    const s = game();
    addProduct(s);
    expect(institutionalKnowledge(s)).toBeGreaterThan(42);
    expect(institutionalKnowledge(s)).toBeLessThan(58);
    addProduct(s); addProduct(s);
    expect(institutionalKnowledge(s)).toBeGreaterThan(24);
    expect(institutionalKnowledge(s)).toBeLessThan(36);
  });
});
