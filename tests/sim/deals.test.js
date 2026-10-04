import { describe, it, expect, afterEach } from 'vitest';
import { createGame } from '../../src/sim/index.js';
import { productsSystem } from '../../src/sim/products.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { DEAL_CUSTOMERS } from '../../src/data/deal-customers.js';
import { isAiText } from '../../src/sim/eras.js';
import { addProduct, addStaff } from './helpers.js';

const group = B.dealGroupWeeks;
afterEach(() => { B.dealGroupWeeks = group; });

// A Classic company with one product that has room to grow and the given salespeople.
function company(sellers = 1, seed = 1) {
  const s = createGame({ seed });
  for (const p of s.staff) p.assignment = { type: 'idle' };
  for (let i = 0; i < sellers; i++) addStaff(s, 'sales', 'mid', { assignment: { type: 'sales' } });
  addProduct(s, { category: 'notes', angle: 'web', model: null, customers: 10, hype: 5 });
  s.brand = 40;
  return s;
}
const deals = (s) => {
  const ctx = makeCtx(s);
  productsSystem(ctx);
  return ctx.events.filter((e) => e.type === 'deal');
};

describe('deal events', () => {
  it('reports the sales team\'s new customers for a product, with a customer name and the top seller', () => {
    const s = company(2);
    const best = s.staff.filter((p) => p.assignment.type === 'sales')[1];
    best.path = 'enterprise_ae';
    const [d] = deals(s);
    expect(d).toMatchObject({ type: 'deal', productId: s.products[0].id, week: s.week, first: true, sellerId: best.id, notable: true });
    expect(DEAL_CUSTOMERS.map((c) => c.name)).toContain(d.customer);
    expect(d.mrr).toBeGreaterThan(0);
    expect(d.customers).toBeGreaterThan(0);
  });

  it('marks only the first deal per product, and later small deals as not notable', () => {
    const s = company(1);
    expect(deals(s)[0].first).toBe(true);
    const B0 = B.dealNotableMrr;
    try {
      B.dealNotableMrr = 1e12;
      const [d] = deals(s);
      expect(d.first).toBe(false);
      expect(d.notable).toBe(false);
    } finally { B.dealNotableMrr = B0; }
  });

  it('makes every deal in a week notable once the week\'s total reaches B.dealNotableMrr', () => {
    const s = company(1);
    addProduct(s, { category: 'email', angle: 'web', model: null, customers: 10, hype: 5 });
    const first = deals(s);
    expect(first).toHaveLength(2);
    const weekMrr = first.reduce((n, d) => n + d.mrr, 0);
    for (const d of first) expect(d.weekMrr).toBe(weekMrr);
    const B0 = B.dealNotableMrr;
    try {
      const later = () => deals(structuredClone(s));
      const total = later().reduce((n, d) => n + d.mrr, 0);
      const biggest = Math.max(...later().map((d) => d.mrr));
      expect(biggest).toBeLessThan(total);
      B.dealNotableMrr = total;
      expect(later().every((d) => d.notable && !d.first)).toBe(true);
      B.dealNotableMrr = total + 1;
      expect(later().some((d) => d.notable)).toBe(false);
    } finally { B.dealNotableMrr = B0; }
  });

  it('is silent without a sales team', () => {
    expect(deals(company(0))).toEqual([]);
  });

  it('groups a product\'s deals over B.dealGroupWeeks and reports the total once', () => {
    B.dealGroupWeeks = 4;
    const s = company(1);
    let total = 0, seen = [];
    for (let w = 0; w < 8; w++) {
      s.week = w;
      const out = deals(s);
      seen.push(out.length);
      total += out.reduce((n, d) => n + d.mrr, 0);
    }
    expect(seen).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    expect(total).toBeGreaterThan(0);
  });

  it('draws names from its own stream: the game\'s random state is untouched', () => {
    const s = company(1);
    const loud = structuredClone(s);
    expect(deals(loud)).toHaveLength(1);
    const quiet = structuredClone(s);
    B.dealGroupWeeks = 1000;
    expect(deals(quiet)).toHaveLength(0);
    expect(loud.rng).toEqual(quiet.rng);
    expect(loud.products).toEqual(quiet.products);
  });

  it('keeps AI-era customers out of earlier eras', () => {
    const ai = DEAL_CUSTOMERS.filter((c) => isAiText(c.name));
    expect(ai.length).toBeGreaterThan(0);
    for (let seed = 1; seed <= 40; seed++) {
      const s = company(1, seed);
      for (let w = 0; w < 6; w++) { s.week = w; for (const d of deals(s)) expect(isAiText(d.customer), d.customer).toBe(false); }
    }
  });

  it('reports boxed sales with units and revenue', () => {
    const s = createGame({ seed: 4, startEra: 'preinternet' });
    const p = addProduct(s, { category: 'notes', angle: 'boxed', model: null, customers: 0, hype: 5 });
    p.boxed = { stock: 1000, stockCost: 8000, installed: 0, deliveries: [], unitsOrdered: 1000, unitsSold: 0, returns: 0, returnUnits: 0,
      salesHistory: [], grossSales: 0, retailerFees: 0, refunds: 0, manufacturingCost: 8000, patchCost: 0, patches: 0, patchedVersion: 1,
      weeklyNet: 0, salesWeek: null, delivered: 1000, buybackCost: 0, withdrawn: 0, buybackWeek: 99, returnsSettled: false, master: null };
    s.brand = 40;
    const [d] = deals(s);
    expect(d).toMatchObject({ type: 'deal', productId: p.id, boxed: true, week: s.week, first: true });
    expect(d.units).toBeGreaterThan(0);
    expect(d.revenue).toBe(p.boxed.weeklyNet);
    expect(d.customer).toBeUndefined();
  });
});
