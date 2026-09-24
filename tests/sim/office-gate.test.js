import { describe, it, expect } from 'vitest';
import { officeGateReason, totalMrr } from '../../src/sim/index.js';
import { runBot } from '../../src/sim/bots.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { ARCHETYPES } from '../../src/data/founders.js';
import { game, addStaff, addProduct } from './helpers.js';

describe('issue #67: the Office Floor gate', () => {
  it('takes a stage index or a stage, and counts cash plus a year of revenue', () => {
    const s = game(1);
    s.week = 110;
    s.stats.launches = 2;
    s.brand = 30;
    while (s.staff.length < 6) addStaff(s, 'engineer', 'mid');
    const p = addProduct(s, { mrr: 0 });
    const worth = OFFICE_STAGES[1].gate.worth;
    s.cash = worth - 1;
    expect(officeGateReason(s, 1)).toMatch(/cash plus a year of revenue/);
    expect(officeGateReason(s, OFFICE_STAGES[1])).toBe(officeGateReason(s, 1));
    s.cash = worth;
    expect(officeGateReason(s, 1)).toBeNull();
    s.cash = 0;
    p.mrr = Math.ceil(worth / 12);
    expect(totalMrr(s)).toBeGreaterThan(0);
    expect(officeGateReason(s, 1)).toBeNull();
  });

  it('every founder pair playing sensibly moves by about week 150 (175 at worst) in at least 3 of 4 seeds', () => {
    const ids = Object.keys(ARCHETYPES);
    const slow = [];
    for (let i = 0; i < ids.length; i++) for (let k = i + 1; k < ids.length; k++) {
      const moves = [];
      for (const seed of [1, 2, 3, 4]) {
        let moved = Infinity;
        runBot('sensible', seed, 200, { founding: { founders: [ids[i], ids[k]] }, onWeek: (s) => { if (moved === Infinity && s.officeStage >= 1) moved = s.week; } });
        moves.push(moved);
      }
      moves.sort((a, b) => a - b);
      if (moves[2] > 175) slow.push(`${ids[i]}+${ids[k]}: ${moves.join(', ')}`);
    }
    expect(slow).toEqual([]);
  }, 600000);
});
