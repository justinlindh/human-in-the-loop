import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

describe('name variety in long runs', () => {
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
