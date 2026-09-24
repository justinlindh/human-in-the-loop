import { describe, it, expect } from 'vitest';
import { clamp, sum, avg, round, newId, dateOf } from '../../src/sim/util.js';

describe('util', () => {
  it('sum and avg of empty arrays are 0', () => {
    expect(sum([])).toBe(0);
    expect(avg([])).toBe(0);
    expect(avg([], (x) => x.v)).toBe(0);
  });

  it('sum and avg accept a mapper', () => {
    expect(sum([{ v: 2 }, { v: 3 }], (x) => x.v)).toBe(5);
    expect(avg([2, 4])).toBe(3);
  });

  it('clamp and round', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(2.5)).toBe(3);
  });

  it('newId increments state.nextId', () => {
    const s = { nextId: 5 };
    expect(newId(s, 's')).toBe('s5');
    expect(newId(s, 'p')).toBe('p6');
    expect(s.nextId).toBe(7);
  });

  it('dateOf maps weeks to calendar dates', () => {
    expect(dateOf(0)).toEqual({ year: 2026, yearIndex: 0, week: 1, quarter: 1 });
    expect(dateOf(52).year).toBe(2027);
    expect(dateOf(51).quarter).toBe(4);
    expect(dateOf(51).week).toBe(52);
    expect(dateOf(13).quarter).toBe(2);
  });
});
