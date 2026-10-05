import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

// Anything cosmetic (a chat line, a prop) takes an id from the shared counter. Ids must never steer the game,
// so shifting the counter part-way through leaves the random stream, money, headcount and ending unchanged.
describe('the course of a game does not depend on ids', () => {
  it('bumping the id counter mid-run changes nothing that matters', () => {
    for (const [bot, seed] of [['balanced', 1], ['allHumans', 2]]) {
      const trace = (bump) => {
        const t = [];
        const r = runBot(bot, seed, 520, { onWeek: (s) => {
          if (bump && s.week === 60) s.nextId += 977;
          t.push(`${s.rng.s}|${Math.round(s.cash)}|${s.staff.length}|${s.products.map((p) => p.score).join(',')}`);
        } });
        return { t, reason: r.reason };
      };
      const a = trace(false);
      const b = trace(true);
      expect(b.t, `${bot}/${seed}`).toEqual(a.t);
      expect(b.reason).toBe(a.reason);
    }
  }, 120000);
});
