import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { ARCHETYPES } from '../../src/data/founders.js';

describe('issue #67: the Office Floor gate in bot runs', () => {
  it('every founder pair playing sensibly moves by about week 150 (175 at worst) in at least 4 of 6 seeds', () => {
    const ids = Object.keys(ARCHETYPES);
    const slow = [];
    for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
      const moves = [];
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        let moved = Infinity;
        runBot('sensible', seed, 200, { founding: { founders: [ids[i], ids[k]] }, onWeek: (s) => { if (moved === Infinity && s.officeStage >= 1) moved = s.week; }, stopWhen: () => moved !== Infinity });
        moves.push(moved);
      }
      moves.sort((a, b) => a - b);
      if (moves[3] > 175) slow.push(`${ids[i]}+${ids[k]}: ${moves.join(', ')}`);
    }
    expect(slow).toEqual([]);
  }, 600000);
});
