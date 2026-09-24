import { describe, it, expect } from 'vitest';
import { dispatch, tick, scoreRun } from '../../src/sim/index.js';
import { endgameSystem, historySystem, endGame, buildEpilogue } from '../../src/sim/endgame.js';
import { raiseDecision } from '../../src/sim/events.js';
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

  it('collapse: a lab nobody understands dies on any long unfixable outage', () => {
    const s = game();
    const small = addProduct(s, { mrr: 1000 });
    addProduct(s, { mrr: 9000 });
    addStaff(s, 'engineer', 'mid');
    s.institutionalKnowledge = B.collapseIkBelow - 1;
    s.outage = { productId: small.id, kind: 'db_wipe', severity: 5, weeks: B.outageCollapseWeeks, unrecoverable: true };
    check(s);
    expect(s.gameOver?.reason).toBe('collapse');
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
    expect(s.gameOver).toBe(null);
    s.outage.unrecoverable = true;
    check(s);
    expect(s.gameOver).toBe(null);
    s.outage.weeks = B.outageCollapseWeeks - 1;
    check(s);
    expect(s.gameOver).toBe(null);
    s.outage.weeks = B.outageCollapseWeeks;
    check(s);
    expect(s.gameOver?.reason).toBe('collapse');
  });
});

describe('winning', () => {
  const ipoReady = () => {
    const s = game();
    s.week = B.retireFromWeek;
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
    s.week = B.retireFromWeek - 1;
    expectFail(expect, dispatch, s, { type: 'ipo' }, 'Opens in year 10');
    s = ipoReady();
    const res = dispatch(s, { type: 'ipo' });
    expect(res.ok).toBe(true);
    expect(s.gameOver).toMatchObject({ won: true, reason: 'retired', retiredVia: 'ipo' });
    expect(res.events).toContainEqual({ type: 'gameOver' });
  });

  it('leading categories does not end the run; the 20th anniversary does, once, and play can go on', () => {
    const lead = game();
    for (const cat of ['email', 'notes', 'pm']) {
      lead.market.categories[cat].incumbentStrength = 1;
      addProduct(lead, { category: cat, customers: CATEGORIES[cat].tam * 0.9, mrr: 100000 });
    }
    lead.week = B.anniversaryWeek - 2;
    check(lead);
    expect(lead.gameOver).toBe(null);
    lead.week = B.anniversaryWeek - 1;
    expect(check(lead)).toContainEqual({ type: 'gameOver' });
    expect(lead.gameOver).toMatchObject({ won: true, reason: 'anniversary' });
    expect(lead.gameOver.score).toBeGreaterThan(0);
    expect(lead.gameOver.epilogue.some((l) => l.includes('turned twenty'))).toBe(true);
    expectFail(expect, dispatch, lead, { type: 'hire', candidateId: lead.candidates[0].id }, 'The run is over');
    expect(dispatch(lead, { type: 'keepPlaying' }).ok).toBe(true);
    expect(lead.gameOver).toBe(null);
    for (const w of [B.anniversaryWeek, 2000]) {
      lead.week = w;
      check(lead);
      expect(lead.gameOver).toBe(null);
    }
    expectFail(expect, dispatch, lead, { type: 'keepPlaying' }, 'Only after the 20th anniversary');
  });

  it('retire needs an IPO or an open offer, then ends the run as a win', () => {
    const s = game();
    s.week = B.retireFromWeek;
    expectFail(expect, dispatch, s, { type: 'retire' }, 'Needs an IPO or an open acquisition offer');
    s.flags.acquisitionOfferUntil = s.week - 1;
    expectFail(expect, dispatch, s, { type: 'retire' }, 'Needs an IPO or an open acquisition offer');
    s.flags.acquisitionOfferUntil = s.week + 5;
    s.flags.acquisitionOfferFrom = 'Gmale';
    const res = dispatch(s, { type: 'retire' });
    expect(res.ok).toBe(true);
    expect(s.gameOver).toMatchObject({ won: true, reason: 'retired', retiredVia: 'acquired' });
    expect(s.flags.acquirer).toBe('Gmale');
    expect(s.gameOver.epilogue.some((l) => l.includes('Gmale'))).toBe(true);

    const t = ipoReady();
    t.flags.acquisitionOfferUntil = t.week + 5;
    expect(dispatch(t, { type: 'retire' }).ok).toBe(true);
    expect(t.gameOver.retiredVia).toBe('ipo');
    expect(t.gameOver.score).toBeGreaterThan(0);
  });

  it('keeping an acquisition offer on the table opens retirement for a while', () => {
    const s = game();
    s.products.length || addProduct(s, { customers: 1000 });
    raiseDecision(makeCtx(s), 'acquisition_offer');
    expect(s.flags.acquisitionOfferWeek).toBe(s.week);
    expect(dispatch(s, { type: 'resolveDecision', choice: 1 }).ok).toBe(true);
    expect(s.gameOver).toBe(null);
    expect(s.flags.acquisitionOfferUntil).toBe(s.week + B.acquisitionOfferOpenWeeks);
    s.week += B.acquisitionOfferOpenWeeks + 1;
    expectFail(expect, dispatch, s, { type: 'retire' }, 'Needs an IPO or an open acquisition offer');
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
    for (const reason of ['ipo', 'acquired', 'runway', 'collapse']) {
      for (const seed of [1, 2, 3]) {
        const s = game(seed);
        s.flags.acquirer = 'Salesfarce';
        s.comprehensionDebt = seed * 30;
        s.stats.juniorsHired = seed * 2;
        const won = ['ipo', 'acquired'].includes(reason);
        const lines = buildEpilogue(s, won ? { won, reason: 'retired', retiredVia: reason } : { won, reason });
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

  it('losses never get alive-only generic lines', () => {
    for (const reason of ['runway', 'collapse']) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = game(seed);
        s.week = 17;
        const lines = buildEpilogue(s, { won: false, reason }).join(' ');
        expect(lines, `${reason} ${seed}`).not.toMatch(/still hiring|still alive|stayed in the loop/i);
      }
    }
  });

  it('a product nobody paid for gets the free-tier line, not the holiday card', () => {
    const s = game();
    s.week = 200;
    s.stats.peakMrr = 0;
    const lines = buildEpilogue(s, { won: false, reason: 'timeout' }).join(' ');
    expect(lines).not.toMatch(/holiday card/);
    expect(lines).toMatch(/free tier/);
    s.stats.peakMrr = 5000;
    expect(buildEpilogue(s, { won: false, reason: 'timeout' }).join(' ')).toMatch(/holiday card/);
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

describe('retire options', () => {
  it('reports both routes with reasons', async () => {
    const { retireOptions } = await import('../../src/sim/endgame.js');
    const s = game();
    expect(retireOptions(s)).toEqual({ ipo: { ok: false, reason: expect.any(String) }, acquired: { ok: false, reason: 'No acquisition offer on the table', by: null } });
    s.flags.acquisitionOfferUntil = s.week + 3;
    s.flags.acquisitionOfferFrom = 'Jirra';
    expect(retireOptions(s).acquired).toEqual({ ok: true, reason: null, by: 'Jirra' });
  });
});
