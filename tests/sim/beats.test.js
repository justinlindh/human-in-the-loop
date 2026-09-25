import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { beatsSystem } from '../../src/sim/beats.js';
import { attritionRisk } from '../../src/sim/alumni.js';
import { agentSpend, rivalMergePrice } from '../../src/sim/economy.js';
import { raiseDecision } from '../../src/sim/events.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { game, addStaff, addProduct, addDesks, passOfficeGates, expectFail } from './helpers.js';

const run = (s) => { const c = makeCtx(s); beatsSystem(c); return c.events; };
const choose = (s, label) => dispatch(s, { type: 'resolveDecision', choice: EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label) });
const raise = (s, id) => { delete s.flags.lastDecisionWeek; s.pendingDecision = null; raiseDecision(makeCtx(s), id, null); expect(s.pendingDecision?.eventId).toBe(id); };

describe('the agent bill', () => {
  it('arrives once, 45 weeks into the Agents era', () => {
    const s = game(1);
    s.week = s.eraSchedule.agents + B.beatAgentBillAfter - 1;
    run(s);
    expect(s.pendingDecision?.eventId).not.toBe('agent_bill');
    s.week++;
    run(s);
    expect(s.pendingDecision?.eventId).toBe('agent_bill');
    s.pendingDecision = null;
    s.week += 10;
    run(s);
    expect(s.pendingDecision).toBeNull();
  });

  it('audit costs weeks of agent spend and calms rogue risk; a cap brings the dials to half; ignoring it sends an invoice', () => {
    const s = game(2);
    s.cash = 1e7;
    addProduct(s);
    s.automation.engineering.level = 1;
    raise(s, 'agent_bill');
    const audit = agentSpend(s, B.agentAuditWeeks);
    const cash = s.cash;
    choose(s, 'Audit every agent');
    expect(s.cash).toBe(cash - audit);
    expect(s.modifiers.some((m) => m.key === 'rogueRisk' && m.value < 0)).toBe(true);
    raise(s, 'agent_bill');
    choose(s, 'Cap the spend');
    expect(s.automation.engineering.level).toBe(B.agentCapLevel);
    raise(s, 'agent_bill');
    choose(s, 'It is fine');
    expect(s.scheduled.some((x) => x.payload?.eventId === 'agent_invoice' && x.week === s.week + 26)).toBe(true);
    raise(s, 'agent_invoice');
    const bill = agentSpend(s, B.agentInvoiceWeeks);
    const before = s.cash;
    choose(s, 'Pay it');
    expect(s.cash).toBe(before - bill);
    expect(s.pendingDecision).toBeNull();
  });
});

describe('the rival mega-round', () => {
  it('waits for a live rival, and each answer moves attrition for 26 weeks', () => {
    const s = game(3);
    s.week = s.eraSchedule.agents + B.beatMegaroundAfter;
    run(s);
    expect(s.pendingDecision?.eventId).not.toBe('rival_megaround');
    s.rival = { name: 'Rivalry', founderName: 'Pat Rival', logoColor: '#fff', categoryId: 'crm', strength: 40, status: 'rising' };
    s.flags.beats = { agent_bill: 0 };
    s.pendingDecision = null;
    delete s.flags.lastDecisionWeek;
    run(s);
    expect(s.pendingDecision?.eventId).toBe('rival_megaround');
    const p = addStaff(s, 'engineer', 'mid', { meaning: 80 });
    const base = attritionRisk(s, p);
    choose(s, 'Let them try');
    expect(attritionRisk(s, p)).toBeCloseTo(base * 1.5);
    s.modifiers = [];
    raise(s, 'rival_megaround');
    const salary = p.salary;
    choose(s, 'Match their offers');
    expect(p.salary).toBeGreaterThan(salary);
    expect(attritionRisk(s, p)).toBeLessThan(base);
  });
});

describe('the floor next door and the first deals', () => {
  it('offers the first HQ expansion when it is open and affordable, and knocking through buys it', () => {
    const s = passOfficeGates(game(4));
    s.cash = 1e9;
    dispatch(s, { type: 'upgradeOffice' });
    dispatch(s, { type: 'upgradeOffice' });
    s.week = s.eraSchedule.agents + B.beatFloorNextDoorAfter;
    s.flags.beats = { agent_bill: 0, rival_megaround: 0 };
    run(s);
    expect(s.pendingDecision?.eventId).not.toBe('floor_next_door');
    while (s.staff.length < OFFICE_STAGES[2].expansions[0].gate.staff) addStaff(s, 'engineer', 'mid');
    s.flags.beats = { agent_bill: 0, rival_megaround: 0 };
    run(s);
    expect(s.pendingDecision?.eventId).toBe('floor_next_door');
    choose(s, 'Knock through');
    expect(s.office.expansion).toBe(1);
  });

  it('the first listings in Consolidation come with an offer to make', () => {
    const s = game(5);
    s.cash = 1e8;
    addDesks(s, 6);
    s.era = { id: 'consolidation', since: s.week };
    s.market.forSale = [{ id: 'fs1', name: 'Tidybox', categoryId: 'crm', arr: 120000, price: 900000, staff: 2, expiresWeek: s.week + 10 }];
    s.flags.beats = { agent_bill: 0, rival_megaround: 0, floor_next_door: 0 };
    run(s);
    expect(s.pendingDecision?.eventId).toBe('deals_open');
    expect(s.pendingDecision.choices[0].label).toBe('Make an offer on Tidybox');
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(s.products.some((p) => p.name === 'Tidybox')).toBe(true);
  });

  it('an offer you cannot make is shown unavailable with the reason, never a fake success', () => {
    const s = game(7);
    s.cash = 1e8;
    s.era = { id: 'consolidation', since: s.week };
    s.office.placed = s.office.placed.filter((p) => p.itemId !== 'desk');
    s.market.forSale = [{ id: 'fs1', name: 'Brisket', categoryId: 'crm', arr: 120000, price: 900000, staff: 2, expiresWeek: s.week + 10 }];
    s.flags.beats = { agent_bill: 0, rival_megaround: 0, floor_next_door: 0 };
    run(s);
    const offer = s.pendingDecision.choices[0];
    expect(offer).toMatchObject({ available: false, reason: 'No desks for their team' });
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 0 }, 'No desks for their team');
    s.cash = 10;
    delete s.flags.lastDecisionWeek;
    s.pendingDecision = null;
    raiseDecision(makeCtx(s), 'deals_open', null);
    expect(s.pendingDecision.choices[0].reason).toBe('Not enough cash');
    s.pendingDecision = null;
    delete s.flags.lastDecisionWeek;
    raiseDecision(makeCtx(s), 'floor_next_door', null);
    expect(s.pendingDecision.choices[0]).toMatchObject({ available: false });
  });

  it('a merger with a stronger rival costs more', () => {
    const s = game(6);
    s.rival = { name: 'R', founderName: 'F', logoColor: '#fff', categoryId: 'crm', strength: 10, status: 'stalled' };
    const weak = rivalMergePrice(s);
    s.rival.strength = 80;
    expect(rivalMergePrice(s)).toBeGreaterThan(weak * 3);
    s.cash = 1e8;
    raise(s, 'rival_merge');
    const cash = s.cash;
    expect(s.pendingDecision.choices[0].hint).toContain(`$${(rivalMergePrice(s) / 1e6).toFixed(1)}M`);
    choose(s, 'Merge');
    expect(s.cash).toBe(cash - rivalMergePrice(s));
    expect(s.rival.status).toBe('merged');
  });
});

// Beats in real runs are checked in full-runs.test.js.
