import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { ARCHETYPES } from '../../src/data/founders.js';

describe('issue #67: the Office Floor gate in bot runs', () => {
  it('every founder pair playing sensibly moves by week 175 in at least two thirds of 60 seeds', () => {
    const ids = Object.keys(ARCHETYPES);
    const slow = [];
    const SEEDS = 60;
    for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
      let onTime = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        let moved = Infinity;
        runBot('sensible', seed, 200, { founding: { founders: [ids[i], ids[k]] }, onWeek: (s) => { if (moved === Infinity && s.officeStage >= 1) moved = s.week; }, stopWhen: () => moved !== Infinity });
        if (moved <= 175) onTime++;
      }
      if (onTime < (SEEDS * 2) / 3) slow.push(`${ids[i]}+${ids[k]}: ${onTime} of ${SEEDS}`);
    }
    expect(slow).toEqual([]);
  }, 600000);
});
