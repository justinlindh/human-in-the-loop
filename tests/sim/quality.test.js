import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { workSystem } from '../../src/sim/work.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { makeCtx } from '../../src/sim/registry.js';
import { game, addStaff } from './helpers.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

// Builds one small product with the given team and returns { score, weeks }.
function ship(seed, team, { category = 'notes', angle = 'copilot', founders = true, year = 0, reviews = false } = {}) {
  const s = game(seed);
  s.cash = 1e6;
  s.week = year * 52;
  if (reviews) s.policies.comprehension_reviews = true;
  if (!founders) s.staff = [];
  for (const [role, seniority] of team) addStaff(s, role, seniority);
  const res = dispatch(s, { type: 'startProject', kind: 'new', name: 'Probe', category, angle, model: 'chatgbt', size: 'small' });
  for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: res.projectId } });
  let weeks = 0;
  while (s.projects.length && weeks < 200) {
    const ctx = makeCtx(s);
    workSystem(ctx);
    projectsSystem(ctx);
    s.week++;
    weeks++;
  }
  return { score: s.products[0].score, weeks };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const band = (team, opts) => {
  const runs = SEEDS.map((seed) => ship(seed, team, opts));
  return { score: mean(runs.map((r) => r.score)), weeks: mean(runs.map((r) => r.weeks)) };
};

describe('review scores reflect team quality', () => {
  const founders = band([]);
  const mixed = band([['engineer', 'senior'], ['designer', 'senior'], ['engineer', 'mid'], ['engineer', 'junior']], { founders: false });
  const juniors = band([['engineer', 'junior'], ['engineer', 'junior'], ['designer', 'junior']], { founders: false });
  const crowd = band([['engineer', 'junior'], ['engineer', 'junior'], ['designer', 'junior'], ['engineer', 'junior']]);
  const greatCombo = band([], { category: 'email', angle: 'summarizer' });

  it('founders alone score 6 to 7.5', () => {
    expect(founders.score).toBeGreaterThanOrEqual(6);
    expect(founders.score).toBeLessThanOrEqual(7.5);
  });

  it('a mixed team with seniors scores 7 to 8.5', () => {
    expect(mixed.score).toBeGreaterThanOrEqual(7);
    expect(mixed.score).toBeLessThanOrEqual(8.5);
  });

  it('all juniors score 4.5 to 6', () => {
    expect(juniors.score).toBeGreaterThanOrEqual(4.5);
    expect(juniors.score).toBeLessThanOrEqual(6);
  });

  it('adding people speeds completion but adds little quality', () => {
    expect(crowd.weeks).toBeLessThan(founders.weeks * 0.85);
    expect(Math.abs(crowd.score - founders.score)).toBeLessThan(1);
  });

  it('a great combo adds about 1.5', () => {
    const gain = greatCombo.score - founders.score;
    expect(gain).toBeGreaterThan(1);
    expect(gain).toBeLessThan(2);
  });
});

describe('review score guards', () => {
  it('a huge team on a small project does not score a free 10', () => {
    const big = band(Array.from({ length: 8 }, () => ['engineer', 'senior']), { founders: false });
    expect(big.weeks).toBeLessThanOrEqual(3);
    expect(big.score).toBeLessThan(9);
  });

  it('the same team scores lower as the years pass', () => {
    expect(band([], { year: 5 }).score).toBeLessThan(band([]).score - 1);
  });

  it('comprehension reviews slow projects and nudge the score up only slightly', () => {
    const plain = band([]);
    const reviewed = band([], { reviews: true });
    expect(reviewed.weeks).toBeGreaterThan(plain.weeks);
    expect(reviewed.score - plain.score).toBeGreaterThanOrEqual(0);
    expect(reviewed.score - plain.score).toBeLessThan(0.5);
  });

  it('startProject returns the new project id through dispatch', () => {
    const s = game();
    const res = dispatch(s, { type: 'startProject', kind: 'refactor' });
    expect(res.ok).toBe(true);
    expect(res.projectId).toBe(s.projects[0].id);
  });
});
