import { describe, it, expect } from 'vitest';
import { createGame, dispatch } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { newInventory, sellBoxes, batchQuote } from '../../src/sim/boxed.js';
import { raiseDecision } from '../../src/sim/events.js';
import { EVENTS } from '../../src/data/events.js';
import { addProduct } from './helpers.js';

const game = () => createGame({ seed: 17, startEra: 'preinternet' });
const product = (s) => {
  const p = addProduct(s); p.angle = 'boxed'; p.customers = p.mrr = 0;
  p.boxed = newInventory(); return p;
};
const [small, large] = B.preinternet.batches;
// Answers whatever decision is open with the choice whose label starts with `label`.
const answer = (s, label) => dispatch(s, { type: 'resolveDecision', choice: s.pendingDecision.choices.findIndex((c) => c.label.startsWith(label)) });

describe('issue #1566: ordering boxes comes to the player', () => {
  it('a boxed launch raises the gold master, then the first order: 100 or 500 copies at their prices, or hold off', () => {
    const s = game();
    expect(dispatch(s, { type: 'startProject', kind: 'new', category: 'notes', angle: 'boxed', size: 'small' }).ok).toBe(true);
    const j = s.projects[0], ctx = makeCtx(s), pts = { features: 10000, reliability: 10000, polish: 10000, novelty: 10000 };
    ctx.weekEffort = { [j.id]: pts }; ctx.weekStats = { [j.id]: pts }; ctx.contributors = {};
    projectsSystem(ctx);
    const p = s.products[0];
    expect(s.pendingDecision.eventId).toBe('pre_master_disk');
    expect(s.scheduled.some((x) => x.payload?.eventId === 'pre_first_order' && x.payload.subjectId === p.id)).toBe(true);
    s.pendingDecision = null;
    s.week += B.decisionGapWeeks;
    expect(raiseDecision(makeCtx(s), 'pre_first_order', p.id)).toBe(true);
    const d = s.pendingDecision;
    expect(d.text).toContain(p.name);
    expect(d.choices.map((c) => c.available)).toEqual([true, true, true]);
    const q = batchQuote(s, p, small), Q = batchQuote(s, p, large);
    expect(d.choices[0].hint).toContain(`$${q.cost.toLocaleString('en-US')}`);
    expect(d.choices[1].hint).toContain(`$${Q.cost.toLocaleString('en-US')}`);
    expect(d.choices[2].hint).toContain('Reports > Inventory');
  });

  it('ordering from the card goes through the order action: charged once, delivered on the usual lead time', () => {
    for (const [label, size] of [['Order 100', small], ['Order 500', large]]) {
      const s = game(), p = product(s), cash = s.cash;
      raiseDecision(makeCtx(s), 'pre_first_order', p.id);
      const cost = batchQuote(s, p, size).cost;
      const res = answer(s, label);
      expect(res.ok).toBe(true);
      expect(s.cash).toBe(cash - cost);
      expect(p.boxed.deliveries).toEqual([{ units: size, cost, dueWeek: s.week + B.preinternet.leadWeeks }]);
      expect(res.events.some((e) => e.type === 'toast' && e.text.includes(`${size} copies ordered`))).toBe(true);
    }
  });

  it('holding off changes nothing, and an order the action would refuse is greyed out with its reason', () => {
    const s = game(), p = product(s);
    raiseDecision(makeCtx(s), 'pre_first_order', p.id);
    const before = structuredClone({ cash: s.cash, boxed: p.boxed });
    answer(s, 'Hold off');
    expect({ cash: s.cash, boxed: p.boxed }).toEqual(before);
    s.cash = batchQuote(s, p, small).cost - 1;
    s.week += B.decisionGapWeeks;
    raiseDecision(makeCtx(s), 'pre_first_order', p.id);
    expect(s.pendingDecision.choices.slice(0, 2).map((c) => [c.available, c.reason])).toEqual([[false, 'Not enough cash'], [false, 'Not enough cash']]);
    expect(s.pendingDecision.choices[2].available).toBe(true);
  });

  it('selling out with buyers left asks once per sell-out, and not while a batch is on its way or before any stock', () => {
    const s = game(), p = product(s);
    sellBoxes(makeCtx(s), p, 50);
    expect(s.pendingDecision).toBe(null);
    p.boxed.stock = 100; p.boxed.stockCost = 800; p.boxed.delivered = 100;
    sellBoxes(makeCtx(s), p, 100);
    expect(s.pendingDecision).toBe(null);
    p.boxed.stock = 40; p.boxed.stockCost = 320;
    sellBoxes(makeCtx(s), p, 60);
    expect(s.pendingDecision?.eventId).toBe('pre_sold_out');
    expect(s.pendingDecision.subjectId).toBe(p.id);
    expect(s.pendingDecision.text).toContain(p.name);
    answer(s, 'Hold off');
    s.week++;
    sellBoxes(makeCtx(s), p, 60);
    expect(s.pendingDecision).toBe(null);
    p.boxed.deliveries.push({ units: 100, cost: 800, dueWeek: s.week + 1 });
    sellBoxes(makeCtx(s), p, 60);
    expect(p.boxed.stock).toBe(40);
    expect(s.pendingDecision).toBe(null);
    p.boxed.stock = 10;
    s.week += B.decisionGapWeeks;
    sellBoxes(makeCtx(s), p, 60);
    expect(s.pendingDecision?.eventId).toBe('pre_sold_out');
  });

  it('a sell-out while a batch is on its way says nothing', () => {
    const s = game(), p = product(s);
    p.boxed.stock = 10; p.boxed.stockCost = 80; p.boxed.delivered = 10;
    p.boxed.deliveries.push({ units: 100, cost: 800, dueWeek: s.week + 5 });
    sellBoxes(makeCtx(s), p, 60);
    expect(p.boxed.stock).toBe(0);
    expect(s.pendingDecision).toBe(null);
  });

  it('the cards are written for players', () => {
    for (const id of ['pre_first_order', 'pre_sold_out']) {
      const ev = EVENTS[id];
      expect(ev.choices.map((c) => c.label)).toEqual([`Order ${small} copies`, `Order ${large} copies`, 'Hold off']);
      for (const c of ev.choices) expect(c.outcome.length).toBeGreaterThan(10);
    }
  });
});
