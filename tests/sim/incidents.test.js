import { describe, it, expect } from 'vitest';
import { dispatch, securityPosture } from '../../src/sim/index.js';
import { incidentsSystem, rogueRisk, catchChance, cyberChance, startOutage, fixCapacity, postureParts } from '../../src/sim/incidents.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { processScheduled } from '../../src/sim/effects.js';
import { INCIDENT_EVENT } from '../../src/data/events.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

const run = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); incidentsSystem(c); ev.push(...c.events); s.week++; } return ev; };

describe('security posture', () => {
  it('rises with security staff and an audit, falls with debt', () => {
    const s = game();
    const p0 = securityPosture(s);
    addStaff(s, 'security', 'senior', { traits: [], speed: 1 });
    const p1 = securityPosture(s);
    expect(p1).toBeGreaterThan(p0);
    s.cash = 1e6;
    expect(dispatch(s, { type: 'buyAudit' }).ok).toBe(true);
    expect(s.cash).toBe(1e6 - B.auditCost);
    const p2 = securityPosture(s);
    expect(p2).toBeCloseTo(p1 + B.postureAudit);
    s.comprehensionDebt = 40;
    expect(securityPosture(s)).toBeLessThan(p2);
    s.comprehensionDebt = 100;
    expect(securityPosture(s)).toBeGreaterThanOrEqual(0);
  });

  it('postureParts adds up to securityPosture', () => {
    const s = game();
    addStaff(s, 'security', 'senior', { path: 'red_team_lead' });
    s.research.done = ['red_team_suite'];
    s.security = { auditBoost: 12, tooling: true };
    for (const debt of [0, 30, 100]) {
      s.comprehensionDebt = debt;
      const p = postureParts(s);
      expect(p.total).toBeCloseTo(securityPosture(s));
      expect(p.total).toBeCloseTo(Math.min(100, Math.max(0, p.staff + p.bonus + p.audit + p.tooling - p.debt)));
    }
  });

  it('audit decays, tooling toggles, audit needs cash', () => {
    const s = game();
    s.security.auditBoost = 20;
    run(s, 5);
    expect(s.security.auditBoost).toBeCloseTo(20 - 5 * B.postureAuditDecay);
    expect(dispatch(s, { type: 'setTooling', on: true }).ok).toBe(true);
    expect(s.security.tooling).toBe(true);
    s.cash = 10;
    expectFail(expect, dispatch, s, { type: 'buyAudit' }, 'Not enough cash');
  });
});

describe('rogue agents', () => {
  it('risk is zero at level 0 and higher on Grokk than Claudius', () => {
    const s = game();
    expect(rogueRisk(s, 'engineering')).toBe(0);
    s.automation.engineering = { level: 1, model: 'claudius' };
    const claud = rogueRisk(s, 'engineering');
    s.automation.engineering.model = 'grokk';
    expect(rogueRisk(s, 'engineering')).toBeGreaterThan(claud);
    expect(claud).toBeGreaterThan(0);
  });

  it('risk rises with oversight shortfall and debt', () => {
    const s = game();
    s.automation.support = { level: 1, model: 'chatgbt' };
    const bare = rogueRisk(s, 'support');
    addStaff(s, 'engineer', 'mid', { traits: [], speed: 1, assignment: { type: 'oversight', targetId: null } });
    expect(rogueRisk(s, 'support')).toBeLessThan(bare);
    s.comprehensionDebt = 80;
    expect(rogueRisk(s, 'support')).toBeGreaterThan(rogueRisk({ ...s, comprehensionDebt: 0 }, 'support'));
  });

  it('catch chance is higher with full coverage', () => {
    const s = game();
    s.automation.engineering = { level: 1, model: 'chatgbt' };
    expect(catchChance(s)).toBe(0);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid', { traits: [], speed: 1, assignment: { type: 'oversight', targetId: null } });
    expect(catchChance(s)).toBeCloseTo(B.catchBase);
    s.staff.at(-1).traits = ['red_teamer'];
    expect(catchChance(s)).toBeCloseTo(Math.min(B.catchMax, B.catchBase + 0.2));
  });

  it('incidents log, alert, and reward overseers who catch them', () => {
    const s = game(2);
    s.automation = Object.fromEntries(Object.keys(s.automation).map((fn) => [fn, { level: 1, model: 'grokk' }]));
    addProduct(s, { customers: 1000 });
    const eye = addStaff(s, 'engineer', 'mid', { traits: ['red_teamer'], speed: 1, meaning: 50, assignment: { type: 'oversight', targetId: null } });
    const ev = [];
    for (let i = 0; i < 400 && (s.stats.caught === 0 || s.stats.incidents === s.stats.caught); i++) {
      ev.push(...run(s, 1));
      s.pendingDecision = null;
      s.outage = null;
      s.cash = 1e6;
    }
    expect(s.stats.incidents).toBeGreaterThan(0);
    expect(s.stats.caught).toBeGreaterThan(0);
    expect(s.incidentLog.length).toBe(Math.min(30, s.stats.incidents));
    expect(ev.some((e) => e.type === 'incident')).toBe(true);
    expect(ev.some((e) => e.type === 'chat' && e.from === '@pagerbot' && e.channel === 'incidents')).toBe(true);
    expect(ev.some((e) => e.type === 'celebrate' && e.staffId === eye.id)).toBe(true);
    expect(eye.record.catches).toBe(s.stats.caught);
  });

  it('a severe uncaught incident raises a decision', () => {
    const s = game(5);
    s.automation.engineering = { level: 1, model: 'grokk' };
    s.comprehensionDebt = 90;
    addProduct(s, { customers: 1000 });
    const raised = [];
    for (let i = 0; i < 600 && !raised.some((d) => Object.values(INCIDENT_EVENT).includes(d.eventId)); i++) {
      run(s, 1);
      if (s.pendingDecision) raised.push(s.pendingDecision);
      s.pendingDecision = null;
      s.scheduled = [];
      s.outage = null;
    }
    const d = raised.find((x) => Object.values(INCIDENT_EVENT).includes(x.eventId));
    expect(d).toBeDefined();
    expect(d.choices.length).toBeGreaterThanOrEqual(2);
    expect(d.text).not.toMatch(/[{}]/);
  });
});

describe('robustness', () => {
  it('a catch does not crash on staff without a record', () => {
    const s = game(2);
    s.automation.engineering = { level: 1, model: 'grokk' };
    addProduct(s);
    const eye = addStaff(s, 'engineer', 'mid', { traits: ['red_teamer'], assignment: { type: 'oversight', targetId: null } });
    delete eye.record;
    for (let i = 0; i < 3000 && s.stats.caught === 0; i++) { s.comprehensionDebt = 80; run(s, 1); s.pendingDecision = null; s.scheduled = []; s.outage = null; }
    expect(s.stats.caught).toBeGreaterThan(0);
    expect(eye.record.catches).toBeGreaterThan(0);
  });
});

describe('cyber attacks', () => {
  it('chance grows with MRR and caps', () => {
    const s = game();
    const base = cyberChance(s);
    const p = addProduct(s, { mrr: 500000 });
    expect(cyberChance(s)).toBeGreaterThan(base);
    p.mrr = 1e9;
    expect(cyberChance(s)).toBe(B.cyberMax);
  });

  it('strong posture blocks attacks and weak posture lets them land', () => {
    const tally = (posture) => {
      const s = game(9);
      addProduct(s, { mrr: 1e9, customers: 1000 });
      s.security.auditBoost = posture;
      let landed = 0;
      let blocked = 0;
      for (let i = 0; i < 300; i++) {
        for (const e of run(s, 1)) {
          if (e.type === 'toast' && e.text.startsWith('Security blocked')) blocked++;
        }
        s.security.auditBoost = posture;
        s.pendingDecision = null;
        s.outage = null;
      }
      landed = s.stats.breaches;
      return { landed, blocked };
    };
    const strong = tally(100);
    const weak = tally(0);
    expect(strong.landed).toBe(0);
    expect(strong.blocked).toBeGreaterThan(0);
    expect(weak.landed).toBeGreaterThan(0);
  });
});

describe('outages', () => {
  it('is unrecoverable without knowledgeable engineers and high debt, recoverable after knowledge rises', () => {
    const s = game();
    const p = addProduct(s);
    for (const f of s.staff) f.knowledge = 5;
    s.comprehensionDebt = 90;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    expect(s.outage.unrecoverable).toBe(true);
    run(s, 3);
    expect(s.outage.weeks).toBe(3);
    expect(s.outage.unrecoverable).toBe(true);
    for (let i = 0; i < 5; i++) addStaff(s, 'engineer', 'senior', { knowledge: 100 });
    run(s, 1);
    expect(s.outage === null || s.outage.unrecoverable === false).toBe(true);
    run(s, 20);
    expect(s.outage).toBe(null);
  });

  it('a recoverable outage clears after ceil(severity / fixCapacity) weeks', () => {
    const s = game();
    const p = addProduct(s);
    s.comprehensionDebt = 0;
    addStaff(s, 'engineer', 'senior', { knowledge: 80 });
    startOutage(makeCtx(s), { productId: p.id, kind: 'ransomware', severity: 3 });
    expect(s.outage.unrecoverable).toBe(false);
    const need = Math.max(1, Math.ceil(3 / Math.max(fixCapacity(s), 0.1)));
    run(s, need - 1);
    expect(s.outage).not.toBe(null);
    const ev = run(s, 1);
    expect(s.outage).toBe(null);
    expect(ev.some((e) => e.type === 'toast' && e.tone === 'good')).toBe(true);
  });

  it('blameless postmortems turn outages into knowledge', () => {
    const s = game();
    s.policies.blameless = true;
    const p = addProduct(s);
    const eng = s.staff.find((x) => x.role === 'engineer');
    const k = eng.knowledge;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 1 });
    run(s, 5);
    expect(eng.knowledge).toBe(k + 5);
  });

  it('two founders can fix a severity 3 outage at low debt', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = game(seed);
      const p = addProduct(s);
      s.comprehensionDebt = 29;
      startOutage(makeCtx(s), { productId: p.id, kind: 'prompt_injection_leak', severity: 3 });
      expect(s.outage.unrecoverable, `seed ${seed}`).toBe(false);
    }
  });

  it('an unrecoverable outage raises a rescue decision with the collapse countdown', () => {
    const s = game();
    const p = addProduct(s, { mrr: 5000 });
    s.comprehensionDebt = 90;
    for (const f of s.staff) f.knowledge = 5;
    const c = makeCtx(s);
    startOutage(c, { productId: p.id, kind: 'db_wipe', severity: 5 });
    expect(s.pendingDecision.eventId).toBe('outage_unfixable');
    expect(s.pendingDecision.choices.map((x) => x.hint).join(' ')).toContain(`${B.outageCollapseWeeks} more weeks`);
    s.cash = 1000;
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 0 }, 'Not enough cash');
    s.cash = 1e6;
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 }).ok).toBe(true);
    expect(s.outage).toBe(null);
    expect(s.cash).toBe(1e6 - B.consultantCost);
  });

  it('an emergency contractor clears the outage a few weeks later', () => {
    const s = game();
    const p = addProduct(s, { mrr: 5000 });
    s.comprehensionDebt = 90;
    for (const f of s.staff) f.knowledge = 5;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    const debt = s.comprehensionDebt;
    expect(dispatch(s, { type: 'resolveDecision', choice: 1 }).ok).toBe(true);
    expect(s.comprehensionDebt).toBeGreaterThan(debt - 0.001);
    for (let w = 0; w < 4 && s.outage; w++) { s.week++; processScheduled(makeCtx(s)); }
    expect(s.outage).toBe(null);
  });

  it('consultants clear an outage and cost cash', () => {
    const s = game();
    const p = addProduct(s);
    expectFail(expect, dispatch, s, { type: 'callConsultants' }, 'No outage to fix');
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    s.cash = 100;
    expectFail(expect, dispatch, s, { type: 'callConsultants' }, 'Not enough cash');
    s.cash = 1e6;
    expect(dispatch(s, { type: 'callConsultants' }).ok).toBe(true);
    expect(s.outage).toBe(null);
    expect(s.cash).toBe(1e6 - B.consultantCost);
  });
});
