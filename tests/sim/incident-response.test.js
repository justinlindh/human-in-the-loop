import { describe, it, expect } from 'vitest';
import { dispatch, createGame, tick } from '../../src/sim/index.js';
import { incidentsSystem, startOutage, clearOutage, fixCapacity, landIncident, responding, fixRanking } from '../../src/sim/incidents.js';
import { processScheduled } from '../../src/sim/effects.js';
import { workSystem } from '../../src/sim/work.js';
import { productsSystem } from '../../src/sim/products.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS, INCIDENT_EVENT } from '../../src/data/events.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { game, addStaff, addProduct } from './helpers.js';

const step = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); incidentsSystem(c); ev.push(...c.events); s.week++; } return ev; };
const quiet = (s) => { for (const fn of Object.keys(s.automation)) s.automation[fn].level = 0; return s; };
const team = (s, n = 4) => Array.from({ length: n }, (_, i) => addStaff(s, 'engineer', i === 0 ? 'senior' : 'mid', { knowledge: 90 - i * 10, traits: [] }));
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('incidents explain themselves (#830)', () => {
  it('an outage names its responders, the top fixers by the fix ranking', () => {
    const s = quiet(game());
    const p = addProduct(s);
    team(s, 5);
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 3 });
    const want = fixRanking(s).slice(0, B.fixersCounted).map((x) => x.id);
    expect(s.outage.responderIds).toEqual(want);
    expect(s.outage.responderIds.length).toBe(B.fixersCounted);
    expect(typeof s.outage.cause).toBe('string');
    expect(s.outage.cost).toEqual({ cash: 0, brand: 0, customers: 0 });
  });

  it('etaWeeks counts down at the current fix capacity, and is null while unrecoverable', () => {
    const s = quiet(game());
    const p = addProduct(s);
    s.comprehensionDebt = 0;
    team(s, 3);
    startOutage(makeCtx(s), { productId: p.id, kind: 'ransomware', severity: 5 });
    const need = Math.max(1, Math.ceil(5 / Math.max(fixCapacity(s), 0.1)));
    expect(s.outage.etaWeeks).toBe(need);
    if (need > 1) { step(s); expect(s.outage.etaWeeks).toBe(need - 1); }
    s.outage = null;
    for (const f of s.staff) f.knowledge = 1;
    s.comprehensionDebt = 90;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    expect(s.outage.unrecoverable).toBe(true);
    expect(s.outage.etaWeeks).toBe(null);
  });

  it('responders are refreshed weekly: someone away is replaced', () => {
    const s = quiet(game());
    const p = addProduct(s);
    for (const f of s.staff) f.knowledge = 5;
    team(s, 5);
    s.comprehensionDebt = 95;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    const first = s.outage.responderIds[0];
    s.staff.find((x) => x.id === first).mood = 'away';
    step(s);
    expect(s.outage.responderIds).not.toContain(first);
    expect(s.outage.responderIds.length).toBe(B.fixersCounted);
  });

  it("responders' project and maintenance output is skipped while they respond; their assignment stays", () => {
    const s = quiet(game());
    const p = addProduct(s);
    for (const f of s.staff) f.knowledge = 0;
    const r = dispatch(s, { type: 'startProject', kind: 'refactor' });
    const [a, b, c, d] = team(s, 4);
    for (const x of [a, b]) x.assignment = { type: 'project', targetId: r.projectId };
    for (const x of [c, d]) x.assignment = { type: 'maintenance', targetId: null };
    d.knowledge = 0;
    c.knowledge = 95;
    const before = makeCtx(s);
    workSystem(before);
    const capBefore = s.ops.maintenanceCapacity;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 3 });
    expect(responding(s, a.id) && responding(s, c.id)).toBe(true);
    expect(responding(s, d.id)).toBe(false);
    const during = makeCtx(s);
    workSystem(during);
    const names = (ctx) => ctx.contributors[r.projectId].map((x) => x.staffId);
    expect(names(before)).toContain(a.id);
    expect(names(during)).not.toContain(a.id);
    expect(s.ops.maintenanceCapacity).toBeLessThan(capBefore);
    expect(a.assignment).toEqual({ type: 'project', targetId: r.projectId });
  });

  it('customers lost to outage churn add up in the running cost', () => {
    const s = quiet(game());
    const p = addProduct(s, { customers: 5000 });
    team(s, 3);
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 3 });
    productsSystem(makeCtx(s));
    expect(s.outage.cost.customers).toBeGreaterThan(0);
    expect(Number.isFinite(s.outage.cost.customers)).toBe(true);
  });

  it('a landed incident puts its cash and brand hit and a plain cause on the outage', () => {
    const s = quiet(game());
    addProduct(s, { customers: 1000 });
    team(s, 3);
    const c = makeCtx(s);
    landIncident(c, { kind: 'ransomware', severity: 3, caught: false, model: null });
    expect(s.outage.cost.cash).toBeGreaterThan(0);
    expect(s.outage.cost.brand).toBe(3);
    expect(s.outage.cause).toMatch(/security posture of \d+/);
    s.outage = null;
    s.automation.engineering = { level: 2, model: 'grokk' };
    landIncident(makeCtx(s), { kind: 'db_wipe', severity: 3, caught: false, model: 'grokk' });
    expect(s.outage.cause).toMatch(/engineering agent/);
  });
});

describe('incidents close with a summary (#830)', () => {
  it('incidentResolved fires at the all-clear with the weeks, cost, responders, and what helped or hurt', () => {
    const s = quiet(game());
    const p = addProduct(s, { customers: 3000 });
    team(s, 3);
    s.comprehensionDebt = 34;
    landIncident(makeCtx(s), { kind: 'ransomware', severity: 3, caught: false, model: null });
    const ids = [...s.outage.responderIds];
    const ev = [];
    for (let w = 0; w < 30 && s.outage; w++) { productsSystem(makeCtx(s)); ev.push(...step(s)); }
    const done = ev.find((e) => e.type === 'incidentResolved');
    expect(done).toBeDefined();
    expect(done).toMatchObject({ productId: p.id, kind: 'ransomware', severity: 3, responderIds: ids });
    expect(done.weeks).toBeGreaterThanOrEqual(1);
    expect(done.cost.cash).toBeGreaterThan(0);
    expect(done.cost.customers).toBeGreaterThan(0);
    expect(done.hurt.some((t) => /^Tech debt 34 made this 1\.9x harder to fix$/.test(t))).toBe(true);
    for (const t of [...done.helped, ...done.hurt]) expect(typeof t).toBe('string');
    expect(JSON.parse(JSON.stringify(done))).toEqual(done);
  });

  it("a rogue agent's severe outage raises its SEV decision at the all-clear, not at the alarm", () => {
    const s = quiet(game());
    addProduct(s, { customers: 1000 });
    team(s, 3);
    s.comprehensionDebt = 0;
    landIncident(makeCtx(s), { kind: 'db_wipe', severity: 5, caught: false, model: 'grokk' });
    expect(s.outage).not.toBe(null);
    expect(s.pendingDecision?.eventId).not.toBe(INCIDENT_EVENT.db_wipe);
    s.pendingDecision = null;
    for (let w = 0; w < 30 && s.outage; w++) step(s);
    expect(s.outage).toBe(null);
    expect(s.pendingDecision.eventId).toBe(INCIDENT_EVENT.db_wipe);
    expect(s.pendingDecision.vars.incidentWeeks).toBeGreaterThanOrEqual(1);
    expect(s.pendingDecision.choices.map((c) => c.label).slice(2)).toEqual(['Write it up properly', 'Patch and move on']);
  });

  it('a severe attack that takes nothing down keeps its decision at the alarm and resolves the same week, with a short postmortem after', () => {
    const s = quiet(game());
    addProduct(s, { customers: 1000 });
    team(s, 3);
    const c = makeCtx(s);
    landIncident(c, { kind: 'data_exfiltration', severity: 4, caught: false, model: null });
    expect(s.outage).toBe(null);
    const done = c.events.find((e) => e.type === 'incidentResolved');
    expect(done).toMatchObject({ kind: 'data_exfiltration', severity: 4, weeks: 0 });
    expect(s.pendingDecision.eventId).toBe('data_exfiltration');
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 }).ok).toBe(true);
    processScheduled(makeCtx(s));
    expect(s.pendingDecision.eventId).toBe('incident_postmortem');
    expect(s.pendingDecision.choices.map((x) => x.label)).toEqual(['Write it up properly', 'Patch and move on']);
  });

  it('an attack that takes a product down asks at the alarm, and follows up at the all-clear', () => {
    const s = quiet(game());
    addProduct(s, { customers: 1000 });
    team(s, 3);
    s.comprehensionDebt = 0;
    landIncident(makeCtx(s), { kind: 'ransomware', severity: 5, caught: false, model: null });
    expect(s.outage).not.toBe(null);
    expect(s.pendingDecision.eventId).toBe('ransomware');
    s.pendingDecision = null;
    s.scheduled = [];
    clearOutage(makeCtx(s), '');
    expect(s.pendingDecision.eventId).toBe('incident_postmortem');
  });

  it('a mild incident that takes nothing down, and any caught incident, never fire it', () => {
    const s = quiet(game());
    addProduct(s, { customers: 1000 });
    team(s, 3);
    for (const [kind, severity, caught] of [['phishing', 2, false], ['db_wipe', 5, true]]) {
      const c = makeCtx(s);
      if (caught) addStaff(s, 'engineer', 'mid', { assignment: { type: 'oversight', targetId: null } });
      landIncident(c, { kind, severity, caught, model: caught ? 'grokk' : null });
      expect(c.events.some((e) => e.type === 'incidentResolved'), kind).toBe(false);
      expect(s.outage).toBe(null);
    }
  });

  it('consultants end an outage with a resolution too', () => {
    const s = quiet(game());
    const p = addProduct(s);
    for (const f of s.staff) f.knowledge = 1;
    s.comprehensionDebt = 90;
    startOutage(makeCtx(s), { productId: p.id, kind: 'db_wipe', severity: 5 });
    s.pendingDecision = null;
    s.cash = 1e6;
    const res = dispatch(s, { type: 'callConsultants' });
    expect(res.ok).toBe(true);
    const done = res.events.find((e) => e.type === 'incidentResolved');
    expect(done).toBeDefined();
    expect(done.helped.join(' ')).toMatch(/consultants/i);
    expect(done.hurt.join(' ')).toMatch(/Nobody on staff/);
  });
});

describe('the postmortem (#830)', () => {
  // A severe rogue-agent outage cleared at once, with its SEV decision open. Write-up is choice 2, patch 3.
  const resolved = (blameless = false) => {
    const s = quiet(game());
    s.policies.blameless = blameless;
    addProduct(s, { customers: 1000 });
    const eng = team(s, 3);
    s.comprehensionDebt = 20;
    landIncident(makeCtx(s), { kind: 'db_wipe', severity: 5, caught: false, model: 'grokk' });
    s.pendingDecision = null;
    s.scheduled = [];
    clearOutage(makeCtx(s), '');
    expect(s.pendingDecision.eventId).toBe('agent_db_wipe');
    return { s, eng };
  };

  const ROGUE = ['db_wipe', 'runaway_spend', 'refund_hallucination', 'pricing_rewrite', 'mass_email', 'prompt_injection_leak'];
  const choiceShape = (ev, at) => {
    expect(ev.choices[at].label, ev.id).toBe('Write it up properly');
    expect(ev.choices[at].effects.postmortem, ev.id).toBe(true);
    expect(ev.choices[at + 1].label, ev.id).toBe('Patch and move on');
    expect(ev.choices[at + 1].effects.debt, ev.id).toBe(B.patchDebt);
  };

  it('rogue-agent decisions keep their first two choices and add write-up and patch; attacks get a two-choice follow-up', () => {
    for (const kind of ROGUE) {
      const ev = EVENTS[INCIDENT_EVENT[kind]];
      expect(ev.choices.length, kind).toBe(4);
      expect(ev.choices.some((c) => /public postmortem/i.test(c.label)), kind).toBe(false);
      choiceShape(ev, 2);
    }
    const follow = EVENTS.incident_postmortem;
    expect(follow.choices.length).toBe(2);
    choiceShape(follow, 0);
  });

  it('writing it up pays debt down, teaches the responders, and keeps them one more week', () => {
    const { s } = resolved();
    const ids = s.flags.lastIncident.responderIds;
    const people = ids.map((id) => s.staff.find((x) => x.id === id));
    const k = people.map((x) => x.knowledge);
    const m = people.map((x) => x.meaning);
    const debt = s.comprehensionDebt;
    s.week++;
    expect(dispatch(s, { type: 'resolveDecision', choice: 2 }).ok).toBe(true);
    expect(s.comprehensionDebt).toBeCloseTo(debt - B.postmortemDebt);
    people.forEach((x, i) => expect(x.knowledge).toBe(Math.min(100, k[i] + B.postmortemKnowledge)));
    people.forEach((x, i) => expect(x.meaning).toBe(Math.max(0, m[i] - B.postmortemMeaning)));
    for (const id of ids) expect(responding(s, id)).toBe(true);
    tick(s);
    for (const id of ids) expect(responding(s, id)).toBe(false);
  });

  it('under Blameless Postmortems the write-up costs no meaning', () => {
    const { s } = resolved(true);
    const people = s.flags.lastIncident.responderIds.map((id) => s.staff.find((x) => x.id === id));
    const m = people.map((x) => x.meaning);
    expect(dispatch(s, { type: 'resolveDecision', choice: 2 }).ok).toBe(true);
    people.forEach((x, i) => expect(x.meaning).toBe(m[i]));
  });

  it('patching and moving on adds tech debt', () => {
    const { s } = resolved();
    const debt = s.comprehensionDebt;
    expect(dispatch(s, { type: 'resolveDecision', choice: 3 }).ok).toBe(true);
    expect(s.comprehensionDebt).toBeCloseTo(debt + B.patchDebt);
  });
});

describe('saves (#830)', () => {
  it('an outage from an old save loads with the new fields filled', () => {
    const st = store();
    const s = createGame({ seed: 4, companyName: 'Old' });
    s.outage = { productId: 'p1', kind: 'db_wipe', severity: 3, weeks: 1, unrecoverable: false };
    saveGame(s, st);
    const res = loadGame(st, s.flags.saveSlot);
    expect(res.ok).toBe(true);
    expect(res.state.outage).toEqual({ productId: 'p1', kind: 'db_wipe', severity: 3, weeks: 1, unrecoverable: false,
      responderIds: [], etaWeeks: null, cost: { cash: 0, brand: 0, customers: 0 }, cause: '' });
  });
});
