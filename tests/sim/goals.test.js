import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { checkGoals } from '../../src/sim/goals.js';
import { GOALS, GOAL_IDS } from '../../src/data/goals.js';
import { classicGame, addProduct, addStaff } from './helpers.js';

const goalsOf = (events) => events.filter((e) => e.type === 'goal').map((e) => e.goalId);
const check = (s) => { const c = makeCtx(s); checkGoals(c); return c.events; };

describe('goal data', () => {
  it('has at least 15 goals with unique ids, text, and finite rewards', () => {
    expect(GOALS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(GOAL_IDS).size).toBe(GOAL_IDS.length);
    for (const g of GOALS) {
      expect(g.name.length, g.id).toBeGreaterThan(3);
      expect(g.desc.length, g.id).toBeGreaterThan(20);
      expect(g.group.length, g.id).toBeGreaterThan(3);
      expect(Number.isFinite(g.reward.cash) && Number.isFinite(g.reward.brand), g.id).toBe(true);
      expect(g.desc).not.toMatch(/startup/i);
    }
    for (const id of ['place_desks', 'first_launch', 'first_hire', 'first_incident', 'office_floor', 'first_award', 'customers_1k',
      'hq', 'category_leader', 'ipo', 'acquisition_offer', 'five_years', 'ten_years', 'legend', 'research_tree']) {
      expect(GOAL_IDS, id).toContain(id);
    }
  });

  it('a new game lists every goal as open', () => {
    const s = createGame({ seed: 2 });
    expect(Object.keys(s.goals).sort()).toEqual([...GOAL_IDS].sort());
    expect(check(s)).toEqual([]);
  });
});

describe('completing goals', () => {
  it('starting a product completes its goal inside the dispatch', () => {
    const s = classicGame();
    const res = dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotter', category: 'notes', angle: 'freemium', size: 'small' });
    expect(goalsOf(res.events)).toEqual(['start_product']);
    expect(s.goals.start_product).toEqual({ done: true, week: 0 });
  });

  it('the first launch pays its reward exactly once', () => {
    const s = classicGame();
    s.stats.launches = 1;
    const cash = s.cash;
    const brand = s.brand;
    const g = GOALS.find((x) => x.id === 'first_launch');
    expect(goalsOf(check(s))).toEqual(expect.arrayContaining(['first_launch', 'start_product']));
    expect(s.cash).toBe(cash + g.reward.cash);
    expect(s.brand).toBe(brand + g.reward.brand);
    expect(check(s)).toEqual([]);
    expect(s.cash).toBe(cash + g.reward.cash);
  });

  it('an incident counts as survived only once the outage is over', () => {
    const s = classicGame();
    const p = addProduct(s, { model: null, angle: 'web' });
    s.stats.incidents = 1;
    s.outage = { productId: p.id, kind: 'ransomware', severity: 3, weeks: 1, unrecoverable: false };
    expect(goalsOf(check(s))).not.toContain('first_incident');
    s.outage = null;
    expect(goalsOf(check(s))).toContain('first_incident');
  });

  it('customers, MRR, leadership, anniversaries, and research trees', () => {
    const s = classicGame();
    for (const cat of ['email', 'notes']) {
      s.market.categories[cat].incumbentStrength = 1;
      addProduct(s, { category: cat, model: null, angle: 'web', customers: 12000, mrr: 120000 });
    }
    s.research.done = ['docs_culture', 'onboarding_kit'];
    s.week = 520;
    const done = goalsOf(check(s));
    expect(done).toEqual(expect.arrayContaining(['customers_1k', 'mrr_100k', 'category_leader', 'five_years', 'ten_years', 'research_tree']));
    expect(s.goals.ten_years.week).toBe(520);
  });

  it('a Legend, a team of ten, and the office moves', () => {
    const s = classicGame();
    for (let i = 0; i < 8; i++) addStaff(s, 'engineer', 'mid');
    s.staff[3].legend = true;
    s.officeStage = 2;
    expect(goalsOf(check(s))).toEqual(expect.arrayContaining(['legend', 'team_10', 'office_floor', 'hq']));
  });

  it('a run of a few years completes goals in the order they happen, each once', () => {
    const s = createGame({ seed: 8 });
    const seen = [];
    const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotter', category: 'notes', angle: 'freemium', size: 'small' }).projectId;
    for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: pid } });
    for (let w = 0; w < 300 && !s.gameOver; w++) {
      for (let c = 0; c < 4 && s.pendingDecision; c++) seen.push(...goalsOf(dispatch(s, { type: 'resolveDecision', choice: c }).events));
      seen.push(...goalsOf(tick(s)));
      s.cash = Math.max(s.cash, 50000);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(['first_launch', 'five_years']));
    expect(seen.indexOf('first_launch')).toBeLessThan(seen.indexOf('five_years'));
    for (const id of seen) expect(s.goals[id].done).toBe(true);
    expect(JSON.parse(JSON.stringify(s.goals))).toEqual(s.goals);
  });
});
