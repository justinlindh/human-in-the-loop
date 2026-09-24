import { describe, it, expect } from 'vitest';
import { runBot, assertFinite, BOTS } from '../../src/sim/bots.js';
import { capacity } from '../../src/sim/staff.js';
import { B } from '../../src/sim/balance.js';

describe('invariants hold for every bot over full runs', () => {
  for (const name of Object.keys(BOTS)) {
    it(`${name}: finite state, staff within capacity, bounded history`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        runBot(name, seed, B.runWeeks, {
          onWeek: (s) => {
            assertFinite(s);
            if (s.staff.length > capacity(s)) throw new Error(`${name}/${seed}: ${s.staff.length} staff over capacity at week ${s.week}`);
            if (s.history.length > B.maxHistory) throw new Error('history over cap');
          },
        });
      }
    }, 120000);
  }

  it('assertFinite names the bad path', () => {
    expect(() => assertFinite({ a: { b: [1, NaN] } })).toThrow('state.a.b.1');
    expect(() => assertFinite({ a: Infinity })).toThrow('state.a');
    expect(() => assertFinite({ a: 1, b: 'x', c: null })).not.toThrow();
  });
});
