import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { FIRST_NAMES, LAST_NAMES } from '../../src/data/names.js';

describe('name variety', () => {
  it('the pools are wide and have no duplicates', () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
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
