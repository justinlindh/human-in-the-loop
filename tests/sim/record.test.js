import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { emptyRecord, ensureRecord } from '../../src/sim/record.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { game, addStaff } from './helpers.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('issue #132: per-person track record', () => {
  it('fills from real work: each role moves its own counters, in whole numbers, and alumni keep theirs', () => {
    // The first of a few seeds where someone has left and the company hired sales, so every check has
    // someone to look at.
    let st = null;
    for (const seed of [5, 6, 7, 8, 9]) {
      st = runBot('sensible', seed, 520).state;
      const everSales = [...st.staff, ...(st.flags.alumni ?? [])].some((p) => p.role === 'sales');
      if (st.flags.alumni?.length && everSales) break;
    }
    // Everyone in the role, including those who have left (alumni keep their records), so the check does not
    // hang on when this seed happened to hire them.
    const by = (role) => [...st.staff.filter((p) => p.role === role), ...st.flags.alumni.filter((a) => a.role === role)];
    const total = (list, key) => list.reduce((a, p) => a + (p.record[key] ?? 0), 0);
    expect(total(by('engineer'), 'features')).toBeGreaterThan(0);
    expect(total(by('engineer'), 'prsMerged')).toBeGreaterThan(0);
    expect(total(by('engineer'), 'launches')).toBeGreaterThan(0);
    expect(total(by('support'), 'tickets')).toBeGreaterThan(0);
    expect(total(by('sales'), 'salesMrr')).toBeGreaterThan(0);
    expect(total(by('sales'), 'deals')).toBeGreaterThan(0);
    expect(total(st.staff, 'mentored')).toBeGreaterThan(0);
    for (const p of st.staff) {
      for (const [k, v] of Object.entries(p.record)) expect(Number.isInteger(v) && v >= 0, `${p.role} ${k}`).toBe(true);
      if (p.role !== 'engineer' && p.role !== 'designer') expect(p.record.features).toBe(0);
      if (p.role !== 'support') expect(p.record.tickets).toBe(0);
      if (p.role !== 'sales') expect(p.record.salesMrr).toBe(0);
    }
    expect(st.flags.alumni.length).toBeGreaterThan(0);
    for (const a of st.flags.alumni) expect(Object.keys(a.record)).toEqual(expect.arrayContaining(Object.keys(emptyRecord())));
  }, 120000);

  it('new hires start at zero, and older saves gain the missing counters', () => {
    const s = game(3);
    const p = addStaff(s, 'engineer', 'mid');
    expect(ensureRecord(p)).toEqual(emptyRecord());
    s.staff[0].record = { mentorWeeks: 4, catches: 1, hardProblemWeeks: 0 };
    const store = fakeStorage();
    saveGame(s, store);
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.staff[0].record).toEqual({ ...emptyRecord(), mentorWeeks: 4, catches: 1 });
  });

  it('older saves move their flags.shippedBy launch counts onto the records', () => {
    const s = game(4);
    const p = addStaff(s, 'engineer', 'mid');
    p.record.launches = 3;
    s.flags.shippedBy = { [p.id]: 7, gone: 2 };
    const store = fakeStorage();
    saveGame(s, store);
    const res = loadGame(store);
    expect(res.ok).toBe(true);
    expect(res.state.staff.find((x) => x.id === p.id).record.launches).toBe(7);
    expect(res.state.flags.shippedBy).toBeUndefined();
  });

  it('security staff get credit for attacks they block', async () => {
    const { makeCtx } = await import('../../src/sim/registry.js');
    const { incidentsSystem } = await import('../../src/sim/incidents.js');
    const s = game(5);
    const sec = addStaff(s, 'security', 'senior', { assignment: { type: 'security', targetId: null } });
    s.security.auditBoost = 100;
    s.week = 400;
    const { addProduct } = await import('./helpers.js');
    addProduct(s, { mrr: 500000, customers: 5000, launchedWeek: 0 });
    let blocked = 0;
    for (let w = 0; w < 400; w++) {
      const c = makeCtx(s);
      incidentsSystem(c);
      blocked += c.events.filter((e) => e.type === 'toast' && /Security blocked/.test(e.text)).length;
      s.outage = null;
      s.week++;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(sec.record.incidentsCaught).toBeGreaterThanOrEqual(blocked);
  });
});
