import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { FIRST_NAMES, LAST_NAMES, INTL_FIRST_NAMES, INTL_LAST_NAMES, US_FIRST_NAMES, US_LAST_NAMES } from '../../src/data/names.js';
import { generateStaff } from '../../src/sim/staff.js';
import { game } from './helpers.js';

describe('name variety', () => {
  it('the pools are wide and have no duplicates', () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
  });

  it('the tiers split the pools cleanly, and draws look like a typical US tech company', () => {
    expect(new Set([...US_FIRST_NAMES, ...INTL_FIRST_NAMES]).size).toBe(FIRST_NAMES.length);
    expect(new Set([...US_LAST_NAMES, ...INTL_LAST_NAMES]).size).toBe(LAST_NAMES.length);
    const intlFirst = new Set(INTL_FIRST_NAMES);
    const intlLast = new Set(INTL_LAST_NAMES);
    let firsts = 0;
    let lasts = 0;
    const N = 4000;
    for (let seed = 1; seed <= N / 20; seed++) {
      const s = game(seed);
      for (let i = 0; i < 20; i++) {
        const [f, l] = generateStaff(s, { role: 'engineer', seniority: 'mid' }).name.split(' ');
        firsts += intlFirst.has(f);
        lasts += intlLast.has(l);
      }
    }
    for (const share of [firsts / N, lasts / N]) {
      expect(share).toBeGreaterThan(0.22);
      expect(share).toBeLessThan(0.34);
    }
  });

  it('a long run never has two people with the same full name, and first names rarely repeat', () => {
    for (const [bot, seed] of [['balanced', 1], ['sensible', 2], ['recklessHumans', 3]]) {
      let worstRepeats = 0;
      runBot(bot, seed, 780, { onWeek: (s) => {
        const people = [...s.staff, ...s.candidates];
        const fulls = people.map((p) => p.name);
        expect(new Set(fulls).size, `${bot}/${seed} week ${s.week}`).toBe(fulls.length);
        const firsts = people.map((p) => p.name.split(' ')[0]);
        worstRepeats = Math.max(worstRepeats, firsts.length - new Set(firsts).size);
      } });
      expect(worstRepeats, `${bot}/${seed}`).toBe(0);
    }
  }, 120000);
});
