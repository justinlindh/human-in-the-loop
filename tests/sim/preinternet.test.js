import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, calendarDate } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { productsSystem, totalMrr } from '../../src/sim/products.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { newInventory, sellBoxes, batchQuote, patchQuote, preinternetEffect, preinternetStep } from '../../src/sim/boxed.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { FUNDING_IDS } from '../../src/data/funding.js';
import { addProduct } from './helpers.js';
import { economySystem, weeklyCosts, weeklyRevenue, recurringRevenue } from '../../src/sim/economy.js';
import { dotcomStep, dotcomDecisionOpen } from '../../src/sim/dotcom.js';
import { assertFinite } from '../../src/sim/bots.js';
import { raiseDecision } from '../../src/sim/events.js';
import { scoreRun } from '../../src/sim/endgame.js';

const game = () => createGame({ seed: 17, startEra: 'preinternet' });
const product = (s) => {
  const p = addProduct(s); p.angle = 'boxed'; p.customers = p.mrr = 0;
  p.boxed = newInventory(); return p;
};
const roundtrip = (s) => {
  const m = new Map(), storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  expect(saveGame(s, storage)).toBe(true);
  const result = loadGame(storage); expect(result.ok).toBe(true); return result.state;
};

describe('pre-internet founding and chapters', () => {
  it.each(FUNDING_IDS)('adds the kit to %s without inventing a company history', (funding) => {
    const s = createGame({ seed: 17, startEra: 'preinternet', funding });
    expect(s.cash).toBe(B.funding[funding].cash + B.eraStarts.preinternet.cash);
    expect(s.founding.eraScoreMult).toBe(B.eraStarts.preinternet.scoreMult);
    expect(s.week).toBe(0); expect(s.staff).toHaveLength(2); expect(s.office.placed).toHaveLength(3);
    expect(s.products).toEqual([]); expect(s.stats.launches).toBe(0); expect(s.stats.incidents).toBe(0);
    expect(s.unlocks.ops).toBe(0); expect(Object.values(s.goals).some((g) => g.skipped || g.done)).toBe(false);
    expect(s.market.unlockedAngles).toEqual(['boxed', 'onprem']);
    expect(Object.values(s.models).some((m) => m.available)).toBe(false);
    expect(calendarDate(s).year).toBe(1990);
    expect(s.founding.earlyChapters.map((c) => c.id)).toEqual(['preinternet', 'dotcom', 'web2']);
    expect(s.eraSchedule.dotcom).toBe(156); expect(s.eraSchedule.web2).toBe(364); expect(s.eraSchedule.classic).toBe(572);
  });

  it('keeps a saved score factor instead of recalibrating an existing company', () => {
    const s = game();
    s.founding.eraScoreMult = 1.2;
    const before = scoreRun(s).score;
    const loaded = roundtrip(s);
    expect(loaded.founding.eraScoreMult).toBe(1.2);
    expect(scoreRun(loaded).score).toBe(before);
  });

  it('starts boxed projects before Classic, keeps shipped inventory through every bridge', () => {
    const s = game();
    expect(dispatch(s, { type: 'startProject', kind: 'new', category: 'notes', angle: 'boxed', size: 'small' }).ok).toBe(true);
    const j = s.projects[0], ctx = makeCtx(s), pts = { features: 10000, reliability: 10000, polish: 10000, novelty: 10000 };
    ctx.weekEffort = { [j.id]: pts }; ctx.weekStats = { [j.id]: pts }; ctx.contributors = {};
    projectsSystem(ctx); const p = s.products[0]; expect(p.boxed.stock).toBe(0);
    p.boxed.installed = 500; p.boxed.stock = 100;
    for (const era of ['dotcom', 'web2', 'classic']) {
      s.pendingDecision = null; s.week = s.eraSchedule[era]; calendarStart(makeCtx(s));
      expect(s.era.id).toBe(era); expect(p.boxed.installed).toBe(500); expect(p.customers).toBe(0); expect(totalMrr(s)).toBe(0);
    }
    expect(dispatch(s, { type: 'startProject', kind: 'new', category: 'notes', angle: 'boxed', size: 'small' }).ok).toBe(false);
    expect(s.market.unlockedAngles).not.toContain('boxed');
    s.ops.maintenanceCapacity = 100000; productsSystem(makeCtx(s));
    expect(p.customers).toBe(0); expect(p.mrr).toBe(0);
  });
});

describe('physical distribution arithmetic', () => {
  it('values trailing box receipts after retailer fees and refunds without inventing MRR', () => {
    const s = game(), p = product(s); p.score = 5; p.boxed.stock = 100;
    const before = scoreRun(s).valuation;
    sellBoxes(makeCtx(s), p, 100);
    const receipts = 95 * B.preinternet.price * (1 - B.preinternet.retailerShare);
    expect(scoreRun(s).valuation - before).toBeCloseTo(receipts * (4 + 8 * s.brand / 100));
    expect(totalMrr(s)).toBe(0);
    s.week = 52;
    expect(scoreRun(s).valuation - before).toBeCloseTo(receipts * (4 + 8 * s.brand / 100));
    s.week = 53;
    expect(scoreRun(s).valuation).toBe(before);
    expect(p.boxed.grossSales).toBe(100 * B.preinternet.price);
  });

  it('bounds the sales ledger, preserves it in saves and excludes sunset products from valuation', () => {
    const s = game(), p = product(s); p.score = 8; p.boxed.stock = 1000;
    for (let week = 0; week < 100; week++) { s.week = week; sellBoxes(makeCtx(s), p, 1); }
    expect(p.boxed.salesHistory).toHaveLength(52);
    const loaded = roundtrip(s);
    expect(scoreRun(loaded)).toEqual(scoreRun(s));
    p.killed = true;
    expect(scoreRun(s).valuation).toBe(s.cash);
  });

  it('converts a saved fractional return obligation to whole eligible units once', () => {
    const s = game(), p = product(s); p.score = 5; p.boxed.stock = 21;
    delete p.boxed.returnUnits;
    p.boxed.returnRemainder = 0.95;
    sellBoxes(makeCtx(s), p, 1);
    expect(p.boxed.returns).toBe(1); expect(p.boxed.returnUnits).toBe(0);
    expect(p.boxed.returnRemainder).toBeUndefined();
    sellBoxes(makeCtx(s), p, 20);
    expect(p.boxed.returns).toBe(2); expect(p.boxed.returnUnits).toBe(0);
  });

  it('offers CD mastering at the chapter midpoint and refuses an unaffordable choice without a charge', () => {
    const s = game();
    s.week = B.preinternet.cdWeek - 1; preinternetStep(makeCtx(s));
    expect(s.pendingDecision).toBeNull();
    s.week++; s.cash = B.preinternet.cdCost - 1; preinternetStep(makeCtx(s));
    expect(s.pendingDecision.eventId).toBe('pre_cd_rom');
    const before = structuredClone(s);
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 }).ok).toBe(false);
    expect(s).toEqual(before);
    expect(dispatch(s, { type: 'resolveDecision', choice: 1 }).ok).toBe(true);
    preinternetStep(makeCtx(s)); expect(s.pendingDecision).toBeNull();
    expect(s.flags.preinternet.cdChoice).toBe('disks');
    expect(s.flags.preinternet.cdCredit).toBeUndefined();
  });

  it('keeps acquired service businesses out of the boxed distribution approach', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame({ seed });
      s.market.forSale = [{ id: 'service', name: 'Service', categoryId: 'notes', arr: 12000, price: 1000, staff: 0, expiresWeek: 10 }];
      expect(dispatch(s, { type: 'acquire', targetId: 'service' }).ok).toBe(true);
      expect(s.products[0].angle).not.toBe('boxed');
      expect(s.products[0].boxed).toBeUndefined();
      expect(s.products[0].mrr).toBe(1000);
    }
  });

  it('charges master verification once and applies the alternative deadline bonus once', () => {
    for (const choice of ['verify', 'rush']) {
      const s = game(), p = product(s), cash = s.cash, reliability = p.stats.reliability;
      preinternetEffect(makeCtx(s), choice, p.id);
      expect(s.cash).toBe(cash + (choice === 'verify' ? -2000 : 3000));
      expect(p.stats.reliability).toBe(reliability + (choice === 'verify' ? 5 : 0));
      const once = structuredClone(s);
      preinternetEffect(makeCtx(s), choice, p.id);
      expect(s).toEqual(once);
    }
  });

  it('withdraws first-delivery leftovers on the fourth playable week and bills them once', () => {
    const s = game(), p = product(s); p.score = 8;
    dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 });
    for (let week = 0; week < 5; week++) { s.week = week; sellBoxes(makeCtx(s), p, 0); }
    expect(p.boxed.stock).toBe(100); expect(p.boxed.buybackWeek).toBe(6);
    const before = s.cash;
    s.week = 5; sellBoxes(makeCtx(s), p, 0);
    expect(p.boxed.stock).toBe(0); expect(p.boxed.withdrawn).toBe(100); expect(s.cash).toBe(before - 160);
    s.week++; sellBoxes(makeCtx(s), p, 0); expect(s.cash).toBe(before - 160);
  });

  it('books box cash once per sales week alongside separate service contracts', () => {
    const s = game(), p = product(s), service = addProduct(s);
    service.mrr = 5200; service.customers = 100;
    p.boxed.stock = 100; p.boxed.stockCost = 800; p.score = 8;
    sellBoxes(makeCtx(s), p, 100);
    expect(recurringRevenue(s)).toBe(1200); expect(weeklyRevenue(s)).toBe(18700);
    const before = s.cash, costs = Object.values(weeklyCosts(s)).reduce((a, b) => a + b, 0);
    economySystem(makeCtx(s)); expect(s.cash).toBe(before + 18700 - costs);
    s.week++; sellBoxes(makeCtx(s), p, 100);
    const after = s.cash; economySystem(makeCtx(s)); expect(s.cash).toBe(after + 1200 - costs);
    expect(p.mrr).toBe(0); expect(p.customers).toBe(0); expect(service.mrr).toBe(5200);
  });

  it('charges the chosen batch, waits two playable weeks and delivers once', () => {
    const s = game(), p = product(s), before = s.cash;
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 }).ok).toBe(true);
    expect(s.cash).toBe(before - 800); expect(p.boxed.stock).toBe(0);
    expect(p.boxed.deliveries).toEqual([{ units: 100, cost: 800, dueWeek: 2 }]);
    sellBoxes(makeCtx(s), p, 0); expect(p.boxed.stock).toBe(0);
    s.week = 1; sellBoxes(makeCtx(s), p, 0); expect(p.boxed.stock).toBe(100);
    s.week = 2; sellBoxes(makeCtx(s), p, 0); expect(p.boxed.stock).toBe(100);
    sellBoxes(makeCtx(s), p, 0); expect(p.boxed.stock).toBe(100); expect(p.boxed.deliveries).toEqual([]);
  });

  it('delivers after exactly two successful ticks, while a decision advances neither time nor delivery', () => {
    const s = game(), p = product(s); p.score = 0;
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 }).ok).toBe(true);
    s.pendingDecision = { eventId: 'held' }; tick(s); expect(s.week).toBe(0); expect(p.boxed.stock).toBe(0);
    s.pendingDecision = null; tick(s); expect(s.week).toBe(1); expect(p.boxed.stock).toBe(0);
    while (s.pendingDecision) dispatch(s, { type: 'resolveDecision', choice: s.pendingDecision.choices.length - 1 });
    tick(s); expect(s.week).toBe(2); expect(p.boxed.delivered).toBe(100); expect(p.boxed.deliveries).toEqual([]);
  });

  it('keeps delivery and first-shelf returns active when the shipment crosses into Classic', () => {
    const s = game(), p = product(s);
    s.week = s.eraSchedule.classic - 1;
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 }).ok).toBe(true);
    s.week++; calendarStart(makeCtx(s)); expect(s.era.id).toBe('classic');
    sellBoxes(makeCtx(s), p, 0);
    expect(p.boxed.stock).toBe(100);
    expect(p.boxed.buybackWeek).toBe(s.week + 1 + B.preinternet.buybackDelayWeeks);
    s.week += B.preinternet.buybackDelayWeeks;
    const before = s.cash; sellBoxes(makeCtx(s), p, 0);
    expect(p.boxed.withdrawn).toBe(100); expect(p.boxed.stock).toBe(0);
    expect(s.cash).toBe(before - 160); expect(p.mrr).toBe(0);
  });

  it('never oversells, refunds poor releases and keeps retail revenue separate from MRR', () => {
    const s = game(), p = product(s); p.boxed.stock = 100; p.boxed.stockCost = 800; p.score = 5;
    sellBoxes(makeCtx(s), p, 200);
    expect(p.boxed.stock).toBe(0); expect(p.boxed.unitsSold).toBe(100); expect(p.boxed.returns).toBe(5);
    expect(p.boxed.installed).toBe(95); expect(p.boxed.grossSales).toBe(25000);
    expect(p.boxed.retailerFees).toBe(7500); expect(p.boxed.refunds).toBe(875);
    expect(p.boxed.weeklyNet).toBe(16625); expect(p.mrr).toBe(0); expect(p.customers).toBe(0);
    sellBoxes(makeCtx(s), p, 200); expect(p.boxed.weeklyNet).toBe(0); expect(p.boxed.unitsSold).toBe(100);
  });

  it('carries fractional returns across small sales and leaves good releases alone', () => {
    const s = game(), p = product(s); p.score = 5; p.boxed.stock = 20;
    for (let n = 0; n < 20; n++) sellBoxes(makeCtx(s), p, 1);
    expect(p.boxed.returns).toBe(1); expect(p.boxed.installed).toBe(19);
    p.score = 6; p.boxed.stock = 100; sellBoxes(makeCtx(s), p, 100);
    expect(p.boxed.returns).toBe(1); expect(p.boxed.installed).toBe(119);
  });

  it('caps the mailed patch, requires installed customers and charges before restoring health', () => {
    const s = game(), p = product(s);
    expect(dispatch(s, { type: 'mailPatch', productId: p.id }).ok).toBe(false);
    p.boxed.installed = 100; p.health = 20; expect(patchQuote(s, p).cost).toBe(200);
    s.ops.maintenanceCapacity = 100000; productsSystem(makeCtx(s)); expect(p.health).toBe(20);
    p.boxed.installed = 8000; expect(patchQuote(s, p).cost).toBe(10000);
    s.cash = 9999; const before = structuredClone(s);
    expect(dispatch(s, { type: 'mailPatch', productId: p.id }).ok).toBe(false); expect(s).toEqual(before);
    s.cash = 20000; expect(dispatch(s, { type: 'mailPatch', productId: p.id }).ok).toBe(true);
    expect(s.cash).toBe(10000); expect(p.health).toBe(p.baseHealth); expect(p.boxed.patchCost).toBe(10000);
    expect(dispatch(s, { type: 'mailPatch', productId: p.id }).ok).toBe(false);
  });

  it('rejects bad batches without mutating state and caps stacking through itemBonus', () => {
    const s = game(), p = product(s);
    for (const units of [-100, 0, 99, 100.5, NaN, Infinity, '100']) {
      const before = structuredClone(s);
      expect(dispatch(s, { type: 'orderBatch', productId: p.id, units }).ok).toBe(false); expect(s).toEqual(before);
    }
    s.office.placed.push({ id: 'dup', itemId: 'disk_duplicator', level: 3, x: 0, y: 0, rot: 0 });
    expect(batchQuote(s, p, 100).cost).toBe(560);
    s.office.placed.push({ id: 'dup2', itemId: 'disk_duplicator', level: 3, x: 2, y: 0, rot: 0 });
    expect(batchQuote(s, p, 100).cost).toBe(440);
    s.office.placed.push({ id: 'dup3', itemId: 'disk_duplicator', level: 3, x: 4, y: 0, rot: 0 });
    expect(batchQuote(s, p, 100).cost).toBe(440);
    s.cash = 0; expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 }).ok).toBe(false);
  });

  it('withdraws sunset inventory and cancels paid deliveries without a refund', () => {
    const s = game(), p = product(s); p.boxed.stock = 100; p.boxed.stockCost = 800;
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 500 }).ok).toBe(true);
    const cash = s.cash;
    expect(dispatch(s, { type: 'killProduct', productId: p.id }).ok).toBe(true);
    expect(p.boxed.withdrawn).toBe(600); expect(p.boxed.deliveries).toEqual([]); expect(p.boxed.stock).toBe(0);
    expect(s.cash).toBe(cash); expect(patchQuote(s, p).reason).toBe('No live boxed product');
  });

  it('settles retailer buyback once and caps the cost; CD capacity is paid and consumed once', () => {
    const s = game(), p = product(s); p.boxed.stock = 10000; p.boxed.stockCost = 80000;
    const before = s.cash; preinternetEffect(makeCtx(s), 'returns', p.id);
    expect(s.cash).toBe(before - 8000); expect(p.boxed.stock).toBe(0);
    preinternetEffect(makeCtx(s), 'returns', p.id); expect(s.cash).toBe(before - 8000);
    s.week = 78; preinternetEffect(makeCtx(s), 'cd'); expect(s.cash).toBe(before - 12000);
    expect(batchQuote(s, p, 100).units).toBe(125); expect(batchQuote(s, p, 100).cost).toBe(1000);
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 100 }).ok).toBe(true);
    s.week += B.preinternet.leadWeeks; sellBoxes(makeCtx(s), p, 0);
    expect(batchQuote(s, p, 100).units).toBe(100);
  });

  it('continues deterministically with stock, fractional returns, a pending batch and decision', () => {
    const s = game(), p = product(s); p.boxed.stock = 13; p.boxed.stockCost = 104; p.score = 5;
    sellBoxes(makeCtx(s), p, 3);
    expect(dispatch(s, { type: 'orderBatch', productId: p.id, units: 500 }).ok).toBe(true);
    expect(raiseDecision(makeCtx(s), 'pre_master_disk', p.id)).toBe(true);
    const loaded = roundtrip(s); expect(loaded).toEqual(s);
    expect(loaded.pendingDecision.eventId).toBe('pre_master_disk');
    for (let n = 0; n < 20; n++) {
      for (const st of [s, loaded]) {
        while (st.pendingDecision) dispatch(st, { type: 'resolveDecision', choice: st.pendingDecision.choices.length - 1 });
        tick(st);
      }
      expect(loaded).toEqual(s);
      assertFinite(loaded);
    }
  });
});

it('anchors dot-com beats after the physical chapter, including a queued bust', () => {
  const s = game(); s.week = s.eraSchedule.dotcom; calendarStart(makeCtx(s));
  expect(s.flags.dotcom.phase).toBe('growth'); expect(s.flags.dotcom.seen?.dotcom_bust).toBeUndefined();
  s.week += B.dotcom.boomWeek; dotcomStep(makeCtx(s)); expect(s.flags.dotcom.phase).toBe('boom');
  s.week = s.eraSchedule.dotcom + B.dotcom.ipoWeek;
  expect(dotcomDecisionOpen(s, 'dotcom_ipo_frenzy')).toBe(true);
  s.week = s.eraSchedule.dotcom + B.dotcom.bustWeek;
  expect(dotcomDecisionOpen(s, 'dotcom_ipo_frenzy')).toBe(false);
  s.pendingDecision = { eventId: 'held' }; dotcomStep(makeCtx(s)); expect(s.flags.dotcom.phase).toBe('bust');
  s.week = s.eraSchedule.web2; dotcomStep(makeCtx(s));
  expect(s.flags.dotcom.settled).toBe(true); expect(s.flags.dotcom.recovered).toBe(true);
  const cash = s.cash; dotcomStep(makeCtx(s)); expect(s.cash).toBe(cash);
});
