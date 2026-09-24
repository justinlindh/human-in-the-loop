import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { economySystem } from '../../src/sim/economy.js';
import { cyberChance } from '../../src/sim/incidents.js';
import { raiseDecision, fillText } from '../../src/sim/events.js';
import { article } from '../../src/sim/util.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, addProduct } from './helpers.js';

const econ = (s) => { const c = makeCtx(s); economySystem(c); s.week++; return c.events; };

describe('runway only counts weeks that lose money', () => {
  it('a profitable week in the red does not count toward bankruptcy', () => {
    const s = game();
    s.cash = -5000;
    addProduct(s, { mrr: 100000, customers: 10000 });
    econ(s);
    expect(s.lowCashWeeks).toBe(0);
  });

  it('a losing week in the red counts', () => {
    const s = game();
    s.cash = -5000;
    econ(s);
    expect(s.lowCashWeeks).toBe(1);
  });

  it('a profitable red week holds the count instead of resetting it', () => {
    const s = game();
    s.cash = -50000;
    econ(s); econ(s);
    expect(s.lowCashWeeks).toBe(2);
    addProduct(s, { mrr: 30000, customers: 3000 });
    econ(s);
    expect(s.lowCashWeeks).toBe(2);
  });
});

describe('bridge loan', () => {
  it('the first dip below zero offers a bridge loan that is repaid later with interest', () => {
    const s = game();
    s.cash = 100;
    const ev = econ(s);
    expect(s.cash).toBeLessThan(0);
    expect(ev).toContainEqual({ type: 'decision' });
    expect(s.pendingDecision.eventId).toBe('bridge_loan');
    const cash = s.cash;
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(s.cash).toBeGreaterThan(cash + 30000);
    const repay = s.scheduled.find((x) => x.kind === 'effects');
    expect(repay).toBeDefined();
    expect(-repay.payload.effects.cash).toBeGreaterThan(s.cash - cash);
  });

  it('is not offered again right away', () => {
    const s = game();
    s.cash = 100;
    econ(s);
    dispatch(s, { type: 'resolveDecision', choice: 2 });
    s.cash = 100;
    econ(s);
    s.cash = -100;
    econ(s);
    expect(s.pendingDecision).toBe(null);
  });

  it('a VC offer becomes possible when cash runs low, before week 26', () => {
    const s = game();
    s.cash = 5000;
    expect(EVENTS.vc_offer.when(s, {})).toBe(true);
    s.cash = 200000;
    expect(EVENTS.vc_offer.when(s, {})).toBe(false);
  });
});

describe('cyber attacks need something to attack', () => {
  it('chance is zero with no revenue', () => {
    const s = game();
    expect(cyberChance(s)).toBe(0);
    addProduct(s, { mrr: 1000 });
    expect(cyberChance(s)).toBeGreaterThan(0);
  });

  it('incident text never pretends a product exists', () => {
    const s = game();
    const c = makeCtx(s);
    raiseDecision(c, 'agent_db_wipe', null);
    expect(s.pendingDecision.text).not.toMatch(/your product|a product/i);
    expect(fillText(s, s.rng, '{product} is down', null)).not.toMatch(/your product/);
  });
});

describe('greenlighting a side project', () => {
  it('does not pull the senior off their current project', () => {
    const s = game();
    s.cash = 1e6;
    const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'X', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }).projectId;
    const senior = s.staff.find((p) => p.seniority === 'senior');
    dispatch(s, { type: 'assign', staffId: senior.id, assignment: { type: 'project', targetId: pid } });
    raiseDecision(makeCtx(s), 'senior_side_project', senior.id);
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(senior.assignment).toEqual({ type: 'project', targetId: pid });
    expect(s.projects.some((j) => j.kind === 'craft')).toBe(true);
  });
});

describe('articles', () => {
  it('picks a or an', () => {
    expect(article('Architect')).toBe('an Architect');
    expect(article('UX Lead')).toBe('a UX Lead');
    expect(article('Tech Lead')).toBe('a Tech Lead');
    expect(article('Incident Commander')).toBe('an Incident Commander');
  });

  it('the path toast reads correctly', () => {
    const s = game();
    const p = s.staff.find((x) => x.seniority === 'senior');
    const res = dispatch(s, { type: 'choosePath', staffId: p.id, pathId: 'architect' });
    expect(res.events.find((e) => e.type === 'toast').text).toContain('is now an Architect');
  });
});

describe('decision choices say ahead of time whether they are possible', () => {
  it('fills available and reason from each requirement', () => {
    const s = game();
    raiseDecision(makeCtx(s), 'conference_expo');
    const [skip, small, big] = s.pendingDecision.choices;
    expect(skip).toMatchObject({ available: true, reason: null });
    expect(small.available).toBe(true);
    expect(big).toMatchObject({ available: false, reason: 'Needs the Office Floor' });
  });
});
