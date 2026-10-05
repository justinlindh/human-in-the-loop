import { describe, it, expect } from 'vitest';
import { dispatch, createGame } from '../../src/sim/index.js';
import { ITEMS } from '../../src/data/items.js';
import { EVENTS } from '../../src/data/events.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { purchaseProblem, upgradeProblem, autoArrange, frontCells, footprintCells } from '../../src/sim/office.js';
import { catchChance, fixCapacity, landIncident, incidentsSystem } from '../../src/sim/incidents.js';
import { nocCatch, nocSystem } from '../../src/sim/noc.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { game, addStaff, addProduct, withItem, expectFail, placeAction } from './helpers.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const nocOf = (s) => s.office.placed.find((p) => p.itemId === 'noc');
const withB = (over, fn) => {
  const old = Object.fromEntries(Object.keys(over).map((k) => [k, B[k]]));
  Object.assign(B, over);
  try { return fn(); } finally { Object.assign(B, old); }
};
// A company with a live product, a NOC at the given level and no Security staff.
function company(level = 1, seed = 2) {
  const s = game(seed);
  s.cash = 1e7;
  addProduct(s, { name: 'Inboxer' });
  s.staff = s.staff.filter((p) => p.role !== 'security' && p.assignment.type !== 'security');
  if (level) withItem(s, 'noc', level);
  return s;
}

describe('NOC item (#342)', () => {
  it('is one shop item with three levels, each needing a bigger office', () => {
    expect(ITEMS.noc).toMatchObject({ kind: 'shop', requires: 'ops', unique: true, levelStage: [0, 1, 2], footprint: { w: 3, h: 1 } });
    expect(ITEMS.noc.costs).toHaveLength(3);
    expect(ITEMS.noc.effects.every((e) => e.nocCatch > 0 && e.outageFix > 0)).toBe(true);
  });

  it('needs Ops and Security, and only one fits in an office', () => {
    const s = company(0);
    delete s.unlocks.ops;
    expect(purchaseProblem(s, 'noc')).toBe('Needs Ops and Security');
    s.unlocks.ops = 0;
    expect(purchaseProblem(s, 'noc')).toBe(null);
    expect(dispatch(s, placeAction(s, 'noc')).ok).toBe(true);
    expect(purchaseProblem(s, 'noc')).toBe('You already have one');
  });

  it('upgrades only as far as the office allows', () => {
    const s = company(1);
    s.officeStage = 0;
    expect(upgradeProblem(s, nocOf(s))).toBe('Needs a bigger office');
    s.officeStage = 1;
    expect(upgradeProblem(s, nocOf(s))).toBe(null);
    nocOf(s).level = 2;
    expect(upgradeProblem(s, nocOf(s))).toBe('Needs a bigger office');
    s.officeStage = 2;
    expect(upgradeProblem(s, nocOf(s))).toBe(null);
  });
});

describe('moving office keeps front zones (#1021)', () => {
  it('the movers keep a grown item\'s front row clear, whatever level it is at', () => {
    for (const [itemId, level] of [['noc', 3], ['noc', 2], ['server_rack', 3], ['standing_desk', 2]]) {
      const desks = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, itemId: 'desk', level: 1, x: 0, y: 0, rot: 0 }));
      const { placed } = autoArrange(2, [{ id: 'x', itemId, level, x: 0, y: 0, rot: 0 }, ...desks]);
      const it = placed.find((p) => p.id === 'x');
      expect(it, itemId).toBeTruthy();
      const front = new Set(frontCells(itemId, it.x, it.y, it.rot, level).map(([x, y]) => `${x},${y}`));
      expect(front.size, itemId).toBeGreaterThan(0);
      for (const p of placed.filter((q) => q !== it)) {
        for (const [x, y] of footprintCells(p.itemId, p.x, p.y, p.rot)) expect(front.has(`${x},${y}`), `${itemId} L${level} front vs ${p.id}`).toBe(false);
      }
    }
  });
});

describe('NOC effects', () => {
  it('with humans on the glass, the catch bonus grows with the security crew up to a full crew', () => {
    const s = company(2);
    expect(nocCatch(s)).toBe(0);
    addStaff(s, 'security', 'mid');
    const one = nocCatch(s);
    expect(one).toBeCloseTo(ITEMS.noc.effects[1].nocCatch / B.nocCrew);
    for (let i = 0; i < B.nocCrew + 2; i++) addStaff(s, 'security', 'mid');
    expect(nocCatch(s)).toBeCloseTo(ITEMS.noc.effects[1].nocCatch);
    for (const p of s.staff.filter((x) => x.role === 'security')) p.assignment = { type: 'idle', targetId: null };
    expect(nocCatch(s)).toBe(0);
    expect(nocCatch(company(0))).toBe(0);
  });

  it('with agents watching, the catch bonus needs nobody and is bigger', () => {
    const s = company(2);
    s.ops.noc = 'agents';
    expect(nocCatch(s)).toBeCloseTo(ITEMS.noc.effects[1].nocCatch * B.nocAgentCatch);
  });

  it('adds to the agent-incident catch chance even with nobody overseeing', () => {
    const s = company(3);
    s.ops.noc = 'agents';
    s.staff = s.staff.filter((p) => p.assignment.type !== 'oversight');
    expect(catchChance(s)).toBeCloseTo(Math.min(B.catchMax, nocCatch(s)));
    expect(catchChance(s)).toBeGreaterThan(0);
  });

  it('adds nothing to the agent-incident catch chance before the Agents era', () => {
    const s = company(3);
    s.ops.noc = 'agents';
    s.staff = s.staff.filter((p) => p.assignment.type !== 'oversight');
    s.era = { id: 'chatgbt', since: 0 };
    expect(nocCatch(s)).toBeGreaterThan(0);
    expect(catchChance(s)).toBe(0);
  });

  it('credits the security crew for a caught attack, and overseers for a caught agent incident', () => {
    const s = company(2);
    const guard = addStaff(s, 'security', 'mid');
    const watcher = addStaff(s, 'engineer', 'mid');
    watcher.assignment = { type: 'oversight', targetId: null };
    const caughtBy = (model, kind) => {
      const before = { g: guard.record?.incidentsCaught ?? 0, w: watcher.record?.incidentsCaught ?? 0 };
      landIncident(makeCtx(s), { kind, severity: 2, caught: true, model });
      return { g: guard.record.incidentsCaught - before.g, w: (watcher.record?.incidentsCaught ?? 0) - before.w };
    };
    expect(caughtBy(null, 'phishing')).toEqual({ g: 1, w: 0 });
    s.outage = null;
    const agent = caughtBy('grokk', 'mass_email');
    expect(agent.w).toBe(1);
  });

  it('speeds up fixing outages', () => {
    const base = company(0);
    const s = company(3);
    expect(fixCapacity(s)).toBeCloseTo(fixCapacity(base) * (1 + ITEMS.noc.effects[2].outageFix));
  });
});

describe('NOC catches and misreads', () => {
  it('a breach is caught early when the NOC catches it; without a NOC it never is', () => {
    const firstBreach = (s) => withB({ cyberBase: 1, cyberMax: 1, cyberGraceWeeks: 0, nocMisreadChance: 0, nocAgentCatch: 100 }, () => {
      s.products[0].mrr = 20000;
      for (let w = 0; w < 40; w++) {
        s.week++;
        s.security.auditBoost = 0;
        const ctx = makeCtx(s);
        incidentsSystem(ctx);
        const hit = ctx.events.find((e) => e.type === 'incident');
        if (hit) return hit;
      }
      return null;
    });
    const plain = company(0);
    plain.ops.noc = 'agents';
    expect(firstBreach(plain)).toMatchObject({ caught: false, misread: false });
    const s = company(3);
    s.ops.noc = 'agents';
    expect(firstBreach(s)).toMatchObject({ caught: true, misread: false });
  });

  it('agents can misread an alert: uncaught, one severity worse, and the outage says so', () => {
    const s = company(2);
    s.ops.noc = 'agents';
    withB({ nocMisreadChance: 1 }, () => {
      const ctx = makeCtx(s);
      landIncident(ctx, { kind: 'db_wipe', severity: 3, caught: true, model: 'grokk' });
      expect(ctx.events.find((e) => e.type === 'incident')).toMatchObject({ caught: false, severity: 4, misread: true });
      expect(s.outage).toMatchObject({ severity: 4, misread: true });
      expect(s.outage.cause).toMatch(/NOC/);
      expect(s.incidentLog.at(-1)).toMatchObject({ caught: false, severity: 4 });
    });
  });

  it('humans never misread, and a misread never pushes severity past 5', () => {
    const s = company(2);
    s.ops.noc = 'humans';
    withB({ nocMisreadChance: 1 }, () => {
      const ctx = makeCtx(s);
      landIncident(ctx, { kind: 'db_wipe', severity: 3, caught: true, model: 'grokk' });
      expect(ctx.events.find((e) => e.type === 'incident')).toMatchObject({ caught: true, severity: 3, misread: false });
      s.outage = null;
      s.ops.noc = 'agents';
      const ctx2 = makeCtx(s);
      landIncident(ctx2, { kind: 'ransomware', severity: 5, caught: false, model: null });
      expect(ctx2.events.find((e) => e.type === 'incident')).toMatchObject({ severity: 5, misread: true });
    });
  });
});

describe('the NOC bet', () => {
  it('is raised once, in the Agents era, when a NOC at level 2 or more is placed', () => {
    const s = company(1);
    nocSystem(makeCtx(s));
    expect(s.pendingDecision).toBe(null);
    nocOf(s).level = 2;
    s.era = { id: 'chatgbt', since: 0 };
    nocSystem(makeCtx(s));
    expect(s.pendingDecision).toBe(null);
    s.era = { id: 'agents', since: 0 };
    nocSystem(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('noc_bet');
    s.pendingDecision = null;
    nocSystem(makeCtx(s));
    expect(s.pendingDecision).toBe(null);
  });

  it('each choice sets the mode and the week it was set', () => {
    for (const [i, mode] of [[0, 'agents'], [1, 'humans']]) {
      const s = company(2);
      nocSystem(makeCtx(s));
      expect(EVENTS.noc_bet.choices).toHaveLength(2);
      expect(dispatch(s, { type: 'resolveDecision', choice: i }).ok).toBe(true);
      expect(s.ops).toMatchObject({ noc: mode, nocSince: s.week });
    }
  });
});

describe('setNocMode', () => {
  it('refuses without a NOC, before the bet, when already set, and too soon after the last switch', () => {
    const s = company(0);
    expectFail(expect, dispatch, s, { type: 'setNocMode', mode: 'agents' }, 'No NOC');
    withItem(s, 'noc', 2);
    expectFail(expect, dispatch, s, { type: 'setNocMode', mode: 'agents' }, 'Not yet');
    s.ops.noc = 'humans';
    s.ops.nocSince = s.week;
    expectFail(expect, dispatch, s, { type: 'setNocMode', mode: 'humans' }, 'Already set');
    expectFail(expect, dispatch, s, { type: 'setNocMode', mode: 'agents' }, 'Too soon');
    s.week += B.nocSwitchWeeks;
    expect(dispatch(s, { type: 'setNocMode', mode: 'agents' }).ok).toBe(true);
    expect(s.ops).toMatchObject({ noc: 'agents', nocSince: s.week });
    expect(dispatch(s, { type: 'setNocMode', mode: 'robots' }).ok).toBe(false);
  });
});

describe('NOC state', () => {
  it('a new game starts with no mode; an old save loads with no mode and outages that were not misreads', () => {
    const s = createGame({ seed: 5 });
    expect(s.ops).toMatchObject({ noc: null, nocSince: null });
    const old = company(1);
    delete old.ops.noc;
    delete old.ops.nocSince;
    old.outage = { productId: old.products[0].id, kind: 'db_wipe', severity: 2, weeks: 0, unrecoverable: false };
    const store = fakeStorage();
    saveGame(old, store);
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.ops).toMatchObject({ noc: null, nocSince: null });
    expect(res.state.outage.misread).toBe(false);
  });
});

// The bots' use of the NOC over whole runs is checked in noc.full.test.js.
