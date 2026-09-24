import { describe, it, expect } from 'vitest';
import { dispatch, tick, scoreRun } from '../../src/sim/index.js';
import { endgameSystem, historySystem, endGame, buildEpilogue } from '../../src/sim/endgame.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

const check = (s) => { const c = makeCtx(s); endgameSystem(c); return c.events; };

describe('losing', () => {
  it('runway: game over after exactly 8 negative weeks', () => {
    const s = game();
    s.staff[0].salary = 100000;
    let weeks = 0;
    while (!s.gameOver && weeks < 30) {
      tick(s);
      weeks++;
      if (s.pendingDecision) s.pendingDecision = null;
    }
    expect(s.gameOver).toMatchObject({ won: false, reason: 'runway' });
    expect(s.lowCashWeeks).toBe(B.runwayLoseWeeks);
  });

  it('collapse: an unrecoverable outage on the main product for too long', () => {
    const s = game();
    const p = addProduct(s, { mrr: 9000 });
    addProduct(s, { mrr: 1000 });
    s.outage = { productId: p.id, kind: 'db_wipe', severity: 5, weeks: B.outageCollapseWeeks - 1, unrecoverable: true };
    check(s);
    expect(s.gameOver).toBe(null);
    s.outage.weeks = B.outageCollapseWeeks;
    const ev = check(s);
    expect(s.gameOver).toMatchObject({ won: false, reason: 'collapse' });
    expect(ev).toContainEqual({ type: 'gameOver' });
  });

  it('collapse does not trigger on a minor product', () => {
    const s = game();
    const small = addProduct(s, { mrr: 1000 });
    addProduct(s, { mrr: 9000 });
    s.outage = { productId: small.id, kind: 'db_wipe', severity: 5, weeks: 20, unrecoverable: true };
    check(s);
    expect(s.gameOver).toBe(null);
  });

  it('collapse: nobody but founders, knowledge gone, and an outage', () => {
    const s = game();
    const p = addProduct(s, { mrr: 0 });
    addProduct(s, { mrr: 5000 });
    s.institutionalKnowledge = 5;
    s.outage = { productId: p.id, kind: 'db_wipe', severity: 2, weeks: 0, unrecoverable: false };
    check(s);
    expect(s.gameOver?.reason).toBe('collapse');
  });
});

describe('winning', () => {
  const ipoReady = () => {
    const s = game();
    s.officeStage = 2;
    s.brand = B.ipoBrand;
    addProduct(s, { mrr: B.ipoMrr });
    return s;
  };

  it('IPO is rejected below each threshold and accepted above', () => {
    let s = ipoReady();
    s.products[0].mrr = B.ipoMrr - 1;
    expectFail(expect, dispatch, s, { type: 'ipo' }, `Needs $${B.ipoMrr.toLocaleString('en-US')} MRR`);
    s = ipoReady();
    s.brand = B.ipoBrand - 1;
    expectFail(expect, dispatch, s, { type: 'ipo' }, `Needs brand ${B.ipoBrand}`);
    s = ipoReady();
    s.officeStage = 1;
    expectFail(expect, dispatch, s, { type: 'ipo' }, 'Needs the HQ Building');
    s = ipoReady();
    const res = dispatch(s, { type: 'ipo' });
    expect(res.ok).toBe(true);
    expect(s.gameOver).toMatchObject({ won: true, reason: 'ipo' });
    expect(res.events).toContainEqual({ type: 'gameOver' });
  });

  it('run end: leader with 3 categories, otherwise timeout', () => {
    const lead = game();
    for (const cat of ['email', 'notes', 'pm']) {
      lead.market.categories[cat].incumbentStrength = 1;
      addProduct(lead, { category: cat, customers: CATEGORIES[cat].tam * 0.9 });
    }
    lead.week = B.runWeeks - 1;
    check(lead);
    expect(lead.gameOver).toMatchObject({ won: true, reason: 'leader' });

    const meh = game();
    meh.week = B.runWeeks - 2;
    check(meh);
    expect(meh.gameOver).toBe(null);
    meh.week = B.runWeeks - 1;
    check(meh);
    expect(meh.gameOver).toMatchObject({ won: false, reason: 'timeout' });
  });
});

describe('score and epilogue', () => {
  it('score is finite and higher for a win than the same state lost', () => {
    const s = game();
    addProduct(s, { mrr: 200000 });
    s.brand = 40;
    const won = scoreRun({ ...s, gameOver: { won: true } });
    const lost = scoreRun({ ...s, gameOver: { won: false } });
    expect(Number.isFinite(won.score)).toBe(true);
    expect(won.score).toBeGreaterThan(lost.score);
    expect(won.valuation).toBeCloseTo(200000 * 12 * (4 + 8 * 0.4) + s.cash);
    expect(won.breakdown).toBeTypeOf('object');
    s.flags.diluted = true;
    expect(scoreRun({ ...s, gameOver: { won: true } }).score).toBeLessThan(won.score);
  });

  it('score never goes negative or NaN with an empty company', () => {
    const s = game();
    s.staff = [];
    s.cash = -1e6;
    s.stats.breaches = 50;
    const r = scoreRun(s);
    expect(r.score).toBe(0);
    expect(Number.isFinite(r.valuation)).toBe(true);
  });

  it('the epilogue has 3 to 5 lines with placeholders filled', () => {
    for (const reason of ['ipo', 'acquired', 'leader', 'runway', 'collapse', 'timeout']) {
      for (const seed of [1, 2, 3]) {
        const s = game(seed);
        s.flags.acquirer = 'Salesfarce';
        s.comprehensionDebt = seed * 30;
        s.stats.juniorsHired = seed * 2;
        const lines = buildEpilogue(s, { won: ['ipo', 'acquired', 'leader'].includes(reason), reason });
        expect(lines.length, reason).toBeGreaterThanOrEqual(3);
        expect(lines.length, reason).toBeLessThanOrEqual(5);
        for (const l of lines) expect(l).not.toMatch(/[{}]/);
        expect(new Set(lines).size).toBe(lines.length);
      }
    }
  });

  it('an early bankruptcy does not get long-arc epilogue lines', () => {
    const s = game();
    s.week = 17;
    const lines = buildEpilogue(s, { won: false, reason: 'runway' }).join(' ');
    expect(lines).not.toMatch(/years later|teaching example|documentary|never hired a junior/i);
    expect(lines).toMatch(/money ran out/);
  });

  it('endGame fills score and epilogue and fires once', () => {
    const s = game();
    const c = makeCtx(s);
    endGame(c, { won: false, reason: 'runway' });
    endGame(c, { won: true, reason: 'ipo' });
    expect(s.gameOver.reason).toBe('runway');
    expect(s.gameOver.epilogue.length).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(s.gameOver.score)).toBe(true);
    expect(c.events.filter((e) => e.type === 'gameOver')).toHaveLength(1);
  });
});

describe('history', () => {
  it('records a weekly snapshot, capped at maxHistory', () => {
    const s = game();
    addStaff(s, 'engineer', 'junior');
    historySystem(makeCtx(s));
    expect(s.history[0]).toMatchObject({ week: 0, cash: s.cash, mrr: 0, customers: 0, juniors: 1, mids: 1, seniors: 1, incidents: 0 });
    for (const k of ['brand', 'debt', 'ik', 'avgMeaning']) expect(Number.isFinite(s.history[0][k])).toBe(true);
    for (let i = 0; i < B.maxHistory + 20; i++) { s.week++; historySystem(makeCtx(s)); }
    expect(s.history.length).toBe(B.maxHistory);
    expect(s.history.at(-1).week).toBe(s.week);
  });
});
