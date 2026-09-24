import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { personPoints, automationPoints, workSystem } from '../../src/sim/work.js';
import { projectsSystem, reviewScore, trendMods } from '../../src/sim/projects.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, expectFail } from './helpers.js';

const total = (p) => p.features + p.polish + p.reliability + p.novelty;

// Runs only the work and projects systems for n weeks; returns all events.
function build(s, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const ctx = makeCtx(s);
    workSystem(ctx);
    projectsSystem(ctx);
    events.push(...ctx.events);
    s.week++;
  }
  return events;
}

const newProject = (over = {}) => ({ type: 'startProject', kind: 'new', name: 'Inboxer', category: 'email', angle: 'summarizer', model: 'chatgbt', size: 'small', ...over });

function startWithFounders(s, over) {
  expect(dispatch(s, newProject(over)).ok).toBe(true);
  const j = s.projects.at(-1);
  for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: j.id } });
  return j;
}

describe('personPoints', () => {
  it('rises with level and skill', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'mid', { traits: [], speed: 1, level: 5 });
    const base = total(personPoints(s, p));
    p.level = 10;
    const higher = total(personPoints(s, p));
    expect(higher).toBeGreaterThan(base);
    for (const k of Object.keys(p.skills)) p.skills[k] = 100;
    expect(total(personPoints(s, p))).toBeGreaterThan(higher);
  });

  it('burnout is far below ok and away is zero', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'mid', { traits: [], speed: 1 });
    const ok = total(personPoints(s, p));
    p.mood = 'burnout';
    expect(total(personPoints(s, p))).toBeLessThan(ok * 0.3);
    p.mood = 'away';
    expect(total(personPoints(s, p))).toBe(0);
  });
});

describe('startProject', () => {
  it('rejects each invalid request with state unchanged', () => {
    const s = game();
    expectFail(expect, dispatch, s, newProject({ category: 'legal' }), 'Category is locked');
    expectFail(expect, dispatch, s, newProject({ angle: 'vertical' }), 'Angle is locked');
    expectFail(expect, dispatch, s, newProject({ model: 'mistrale' }), 'Model is not available');
    expectFail(expect, dispatch, s, newProject({ size: 'large' }), 'Needs a bigger office');
    expectFail(expect, dispatch, s, newProject({ size: 'huge' }), 'Unknown size');
    s.models.chatgbt.deprecated = true;
    expectFail(expect, dispatch, s, newProject(), 'Model is not available');
    s.models.chatgbt.deprecated = false;
    s.cash = 100;
    expectFail(expect, dispatch, s, newProject(), 'Not enough cash');
    s.cash = 1e6;
    for (const p of s.staff) { p.mood = 'away'; }
    expectFail(expect, dispatch, s, newProject(), 'Nobody is free to build it');
    for (const p of s.staff) { p.mood = 'ok'; }
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'update', productId: 'nope' }, 'No such product');
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'migration', productId: 'nope' }, 'No such product');
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'weird' }, 'Unknown project kind');
  });

  it('deducts the cost and scales points with the year', () => {
    const s = game();
    dispatch(s, newProject());
    expect(s.cash).toBe(B.startCash - B.sizes.small.cost);
    expect(s.projects[0].pointsNeeded).toBe(B.sizes.small.points);
    expect(s.projects[0].researchId).toBe(null);
    s.week = 52 * 3;
    dispatch(s, newProject());
    expect(s.projects[1].pointsNeeded).toBeCloseTo(B.sizes.small.points * (1 + 3 * B.pointsGrowthPerYear));
  });
});

describe('building and launching', () => {
  it('two founders complete a small project in 6 to 20 weeks and launch a product', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = game(seed);
      const j = startWithFounders(s);
      let weeks = 0;
      let events = [];
      while (s.projects.length && weeks < 40) { events = events.concat(build(s, 1)); weeks++; }
      expect(weeks, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(weeks, `seed ${seed}`).toBeLessThanOrEqual(20);
      const pr = s.products[0];
      expect(pr.name).toBe(j.name);
      expect(pr.score).toBeGreaterThanOrEqual(1);
      expect(pr.score).toBeLessThanOrEqual(10);
      expect(pr.reviews.length).toBe(4);
      expect(pr.customers).toBe(0);
      expect(pr.health).toBe(pr.baseHealth);
      expect(pr.copyAtWeek).toBeGreaterThan(s.week);
      expect(events.some((e) => e.type === 'launch' && e.productId === pr.id)).toBe(true);
      expect(events.some((e) => e.type === 'bubble')).toBe(true);
      expect(s.stats.launches).toBe(1);
      expect(s.discoveredCombos['email:summarizer']).toBeCloseTo(1.45);
      expect(s.staff.every((p) => p.assignment.type !== 'project')).toBe(true);
    }
  });

  it('pre-launch banked hype carries into the product', () => {
    const s = game();
    const j = startWithFounders(s);
    j.bankedHype = 30;
    build(s, 30);
    expect(s.products[0].hype).toBe(30);
  });

  it('an update bumps the version and refreshes novelty', () => {
    const s = game();
    startWithFounders(s);
    build(s, 30);
    const pr = s.products[0];
    pr.novelty = 1;
    expect(dispatch(s, { type: 'startProject', kind: 'update', productId: pr.id }).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'update', productId: pr.id }, 'Already in progress');
    const j = s.projects[0];
    for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: j.id } });
    build(s, 30);
    expect(pr.version).toBe(2);
    expect(pr.novelty).toBeCloseTo(4, 0);
  });

  it('a migration clears the deadline; a refactor pays down debt', () => {
    const s = game();
    startWithFounders(s);
    build(s, 30);
    const pr = s.products[0];
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'migration', productId: pr.id }, 'No migration needed');
    pr.migrationDueWeek = s.week + 10;
    s.models.chatgbt.version = 2;
    dispatch(s, { type: 'startProject', kind: 'migration', productId: pr.id });
    s.comprehensionDebt = 50;
    dispatch(s, { type: 'startProject', kind: 'refactor' });
    const [mig, ref] = s.projects;
    dispatch(s, { type: 'assign', staffId: s.staff[0].id, assignment: { type: 'project', targetId: mig.id } });
    dispatch(s, { type: 'assign', staffId: s.staff[1].id, assignment: { type: 'project', targetId: ref.id } });
    build(s, 60);
    expect(pr.migrationDueWeek).toBe(null);
    expect(pr.modelVersion).toBe(2);
    expect(s.comprehensionDebt).toBe(50 - B.debtPaydownRefactor);
  });
});

describe('reviewScore', () => {
  const project = (stats, over = {}) => ({ kind: 'new', category: 'notes', angle: 'copilot', size: 'medium', stats, ...over });

  it('the same stats score lower in year 5 than year 0', () => {
    const a = game(7);
    const b = game(7);
    b.week = 52 * 5;
    const M = B.sizes.medium.points;
    const stats = { features: 0.35 * M, polish: 0.25 * M, reliability: 0.25 * M, novelty: 0.15 * M };
    expect(reviewScore(b, project(stats)).score).toBeLessThan(reviewScore(a, project(stats)).score);
  });

  it('zero reliability scores lower than balanced stats of equal total', () => {
    const a = game(7);
    const b = game(7);
    const M = B.sizes.medium.points;
    const balanced = reviewScore(a, project({ features: 0.35 * M, polish: 0.25 * M, reliability: 0.25 * M, novelty: 0.15 * M }));
    const lopsided = reviewScore(b, project({ features: 0.6 * M, polish: 0.25 * M, reliability: 0, novelty: 0.15 * M }));
    expect(lopsided.score).toBeLessThan(balanced.score);
  });

  it('reviews are clamped, rounded to halves, and quoted', () => {
    const s = game();
    const r = reviewScore(s, project({ features: 5000, polish: 5000, reliability: 5000, novelty: 5000 }));
    expect(r.score).toBeLessThanOrEqual(10);
    for (const rev of r.reviews) {
      expect(rev.score * 2).toBe(Math.round(rev.score * 2));
      expect(rev.quote.length).toBeGreaterThan(5);
    }
  });

  it('trendMods multiplies angle and category mods', () => {
    const s = game();
    s.market.trend = 'agents_hot';
    expect(trendMods(s, 'crm', 'agent')).toBeCloseTo(1.4);
    s.market.trend = 'compliance';
    expect(trendMods(s, 'legal', 'agent')).toBeCloseTo(0.8 * 1.2);
  });
});

describe('automation output', () => {
  it('adds points only when the level is above zero', () => {
    const s = game();
    expect(total(automationPoints(s))).toBe(0);
    s.automation.engineering.level = 1;
    expect(total(automationPoints(s))).toBeGreaterThan(0);
  });

  it('goes to maintenance capacity when there are no projects, and to projects otherwise', () => {
    const s = game();
    s.automation.engineering.level = 1;
    build(s, 1);
    expect(s.ops.maintenanceCapacity).toBeGreaterThan(0);
    dispatch(s, newProject());
    build(s, 1);
    expect(s.ops.maintenanceCapacity).toBe(0);
    expect(s.projects[0].progress).toBeGreaterThan(0);
  });
});
