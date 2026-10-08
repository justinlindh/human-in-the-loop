import { describe, it, expect } from 'vitest';
import { officeGateReason, totalMrr } from '../../src/sim/index.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { game, addStaff, addProduct } from './helpers.js';

// Every founder pair's bot runs through the gate are checked in office-gate.full.test.js.

describe('issue #67: the Office Floor gate', () => {
  it('takes a stage index or a stage; from orCashWeek, savings stand in for the MRR minimum', () => {
    const s = game(1);
    const g = OFFICE_STAGES[1].gate;
    s.week = g.orCashWeek - 1;
    s.stats.launches = 2;
    s.brand = 30;
    while (s.staff.length < 6) addStaff(s, 'engineer', 'mid');
    const p = addProduct(s, { mrr: 0 });
    s.cash = g.orCash;
    expect(officeGateReason(s, 1)).toMatch(/MRR, or \$450,000 in the bank from/);
    expect(officeGateReason(s, OFFICE_STAGES[1])).toBe(officeGateReason(s, 1));
    s.week = g.orCashWeek;
    expect(officeGateReason(s, 1)).toBeNull();
    s.cash = g.orCash - 1;
    expect(officeGateReason(s, 1)).not.toBeNull();
    p.mrr = g.mrr;
    expect(totalMrr(s)).toBe(g.mrr);
    expect(officeGateReason(s, 1)).toBeNull();
  });

  it('issue #1908: the dates read as the HUD calendar, with the founding offset', () => {
    const s = game(1);
    s.week = 0;
    s.cash = 0;
    expect(officeGateReason(s, 1)).toBe('Available from 2021 · Q1 · Wk 1');
    s.founding = { ...s.founding, calendarOffset: 52 };
    expect(officeGateReason(s, 1)).toBe('Available from 2022 · Q1 · Wk 1');
    s.week = OFFICE_STAGES[1].gate.week;
    s.stats.launches = 2;
    s.brand = 30;
    while (s.staff.length < 6) addStaff(s, 'engineer', 'mid');
    expect(officeGateReason(s, 1)).toBe('Needs $250,000 MRR, or $450,000 in the bank from 2022 · Q3 · Wk 32');
    s.founding.calendarOffset = 0;
    const reason = officeGateReason(s, 1);
    expect(reason).toBe('Needs $250,000 MRR, or $450,000 in the bank from 2021 · Q3 · Wk 32');
    // The prefix ui's Office panel rewrites.
    expect(reason).toMatch(/^Needs \$[\d,]+ MRR, or \$[\d,]+ in the bank from /);
  });
});
