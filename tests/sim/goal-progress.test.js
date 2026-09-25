import { describe, it, expect } from 'vitest';
import { goalHelpers } from '../../src/sim/index.js';
import { GOALS } from '../../src/data/goals.js';
import { game, addStaff, addDesks } from './helpers.js';

describe('issue #607: count goals report their progress', () => {
  it('the count goals have progress, capped at the target, and agree with done', () => {
    const ids = GOALS.filter((g) => g.progress).map((g) => g.id).sort();
    expect(ids).toEqual(['customers_1k', 'five_years', 'mrr_100k', 'place_desks', 'team_10', 'ten_years']);
    const s = game(1);
    s.week = 300;
    addDesks(s, 1);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    const h = goalHelpers(s);
    const byId = Object.fromEntries(GOALS.map((g) => [g.id, g]));
    expect(byId.five_years.progress(s, h)).toEqual({ n: 260, of: 260 });
    expect(byId.ten_years.progress(s, h)).toEqual({ n: 300, of: 520 });
    expect(byId.team_10.progress(s, h)).toEqual({ n: s.staff.length, of: 10 });
    for (const g of GOALS.filter((x) => x.progress)) {
      const { n, of } = g.progress(s, h);
      expect(Number.isFinite(n) && Number.isFinite(of) && n >= 0 && n <= of, g.id).toBe(true);
      expect(n >= of, g.id).toBe(!!g.done(s, h));
    }
  });
});
