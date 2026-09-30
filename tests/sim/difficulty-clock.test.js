import { describe, it, expect } from 'vitest';
import { createGame, dispatch } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { dateOf, marketYear, marketWeek, earlyWeeks } from '../../src/sim/util.js';
import { cloneChance } from '../../src/sim/market.js';
import { marketSize } from '../../src/sim/products.js';
import { generateStaff } from '../../src/sim/staff.js';
import { createRng } from '../../src/sim/rng.js';

// Market difficulty follows the calendar from the Classic founding year; company costs follow company age.
describe('the market clock', () => {
  it('is company age in a Classic career', () => {
    const s = createGame({ seed: 2 });
    for (const week of [0, 51, 52, 300, 1039]) {
      s.week = week;
      expect(marketYear(s)).toBe(dateOf(week).yearIndex);
      expect(marketWeek(s)).toBe(week);
    }
  });

  it('stands at the Classic founding year through the early chapters, then runs with the calendar', () => {
    const s = createGame({ seed: 2, startEra: 'dotcom' });
    const early = earlyWeeks(s);
    for (const week of [0, 150, early - 1, early]) { s.week = week; expect(marketYear(s)).toBe(0); }
    s.week = early + 2 * 52; expect(marketYear(s)).toBe(2);
    expect(marketWeek(s)).toBe(2 * 52);
  });

  it('starts a later founding at its calendar year', () => {
    const s = createGame({ seed: 2, startEra: 'chatgbt' });
    expect(marketYear(s)).toBe(Math.floor(s.founding.calendarOffset / 52));
    expect(marketYear(s)).toBeGreaterThan(0);
  });
});

describe('market difficulty on the calendar', () => {
  const dotcomAt = (week) => { const s = createGame({ seed: 4, startEra: 'dotcom' }); s.week = week; return s; };
  const classicAt = (week) => { const s = createGame({ seed: 4 }); s.week = week; return s; };

  it('clones, market size and the talent pool match a fresh Classic founding when a dot-com company reaches Classic', () => {
    const late = dotcomAt(earlyWeeks(dotcomAt(0)) + 10);
    const fresh = classicAt(10);
    expect(cloneChance(late)).toBe(cloneChance(fresh));
    expect(marketSize(late, 'email')).toBe(marketSize(fresh, 'email'));
    const talent = (s) => { s.rng = createRng(9); s.era = { id: 'classic', since: 0 }; return generateStaff(s, { role: 'engineer', seniority: 'mid' }).skills; };
    expect(talent(late)).toEqual(talent(fresh));
    expect(cloneChance(classicAt(10 + 3 * 52))).toBeGreaterThan(cloneChance(fresh));
  });

  it('sizes a dot-com project like a year-one project, however old the company is', () => {
    const s = dotcomAt(150);
    s.cash = 1e6;
    expect(dateOf(s.week).yearIndex).toBe(2);
    expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'Intranet', category: 'email', angle: 'onprem', size: 'small' }).ok).toBe(true);
    expect(s.projects.at(-1).pointsNeeded).toBe(B.sizes.small.points);
  });
});
