import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

// A company-wide celebrate (staffId null) starts a party whose banner shows its cause; a personal one
// (staffId set) is that person's cheer and carries no cause.
describe('celebrate events', () => {
  it('give every company-wide party a caption, over seeded games', () => {
    const bad = [];
    let parties = 0;
    let cheers = 0;
    const check = (evs) => {
      for (const e of evs) {
        if (e.type !== 'celebrate') continue;
        if (e.staffId == null) {
          parties++;
          if (typeof e.cause !== 'string' || !e.cause.trim()) bad.push(e);
        } else cheers++;
      }
    };
    for (const bot of ['sensible', 'balanced']) {
      for (const seed of [1, 2, 3]) runBot(bot, seed, null, { onEvents: check, onWeek: (s, evs) => check(evs) });
    }
    expect(bad).toEqual([]);
    expect(parties).toBeGreaterThan(0);
    expect(cheers).toBeGreaterThan(0);
  }, 600000);
});
