import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { generateStaff, refreshCandidates, outputMult, capacity, staffUpkeep, staffMods, topStats } from '../../src/sim/staff.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { ASSIGNMENT_TYPES } from '../../src/contract/events.js';
import { game, addStaff, expectFail, advance } from './helpers.js';

const ROLES = ['engineer', 'designer', 'marketer', 'support', 'security', 'sales'];
const upkeep = (s, n = 1) => { for (let i = 0; i < n; i++) { staffUpkeep(makeCtx(s)); s.week++; } };

describe('generateStaff', () => {
  it('matches the contract shape and ranges for every role and seniority', () => {
    const s = game();
    for (const role of ROLES) {
      for (const seniority of ['junior', 'mid', 'senior']) {
        for (let i = 0; i < 10; i++) {
          const p = generateStaff(s, { role, seniority });
          expect(p.role).toBe(role);
          expect(p.seniority).toBe(seniority);
          for (const v of Object.values(p.skills)) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(100);
          }
          const [lo, hi] = { junior: [1, 2], mid: [5, 7], senior: [10, 13] }[seniority];
          expect(p.level).toBeGreaterThanOrEqual(lo);
          expect(p.level).toBeLessThanOrEqual(hi);
          expect(p.speed).toBeGreaterThanOrEqual(0.8);
          expect(p.speed).toBeLessThanOrEqual(1.2);
          expect(p.meaning).toBeGreaterThanOrEqual(70);
          expect(p.meaning).toBeLessThanOrEqual(90);
          expect(p.stamina).toBe(100);
          expect(p.knowledge).toBe(B.newHireKnowledge);
          expect(p.traits.length).toBeLessThanOrEqual(2);
          expect(new Set(p.traits).size).toBe(p.traits.length);
          expect(p.salary % 10).toBe(0);
          expect(ASSIGNMENT_TYPES).toContain(p.assignment.type);
          expect(p.mood).toBe('ok');
          expect(p.founder).toBe(false);
          expect(p).toMatchObject({ path: null, pathPending: false, legend: false, record: { mentorWeeks: 0, catches: 0, hardProblemWeeks: 0 } });
          expect(p.appearance.hairColor).toMatch(/^#[0-9a-f]{6}$/);
          expect(['none', 'glasses', 'headphones', 'beanie', 'cap']).toContain(p.appearance.accessory);
        }
      }
    }
  });
});

describe('hire', () => {
  it('succeeds: fee deducted, stats incremented, candidate removed, events emitted', () => {
    const s = game();
    s.candidates[0] = generateStaff(s, { role: 'engineer', seniority: 'junior' });
    const c = s.candidates[0];
    const cash = s.cash;
    const res = dispatch(s, { type: 'hire', candidateId: c.id });
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(cash - c.salary * B.hireFeeWeeks);
    expect(s.stats.hires).toBe(1);
    expect(s.stats.juniorsHired).toBe(1);
    expect(s.candidates.find((x) => x.id === c.id)).toBeUndefined();
    expect(s.staff.find((x) => x.id === c.id).hiredWeek).toBe(s.week);
    expect(res.events.map((e) => e.type)).toEqual(expect.arrayContaining(['hire', 'chat']));
    const chat = res.events.find((e) => e.type === 'chat');
    expect(chat).toMatchObject({ channel: 'general', from: c.name, fromId: c.id, replyTo: null, reactions: {} });
    expect(chat.id).toMatch(/^m\d+$/);
  });

  it('fails without cash, when the office is full, or with a bad id', () => {
    const s = game();
    s.cash = 10;
    expectFail(expect, dispatch, s, { type: 'hire', candidateId: s.candidates[0].id }, 'Not enough cash');
    s.cash = 1e6;
    addStaff(s, 'engineer', 'mid');
    addStaff(s, 'engineer', 'mid');
    expect(s.staff.length).toBe(capacity(s));
    expectFail(expect, dispatch, s, { type: 'hire', candidateId: s.candidates[0].id }, 'Office is full');
    expectFail(expect, dispatch, s, { type: 'hire', candidateId: 'nope' }, 'No such candidate');
  });
});

describe('topStats', () => {
  it('only boosts stats the role actually uses', () => {
    expect(topStats('security')).toEqual(['reliability']);
    expect(topStats('engineer').sort()).toEqual(['features', 'reliability']);
    expect(topStats('designer').sort()).toEqual(['novelty', 'polish']);
  });
});

describe('fire', () => {
  it('emits a resign event flagged as fired', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'mid');
    const res = dispatch(s, { type: 'fire', staffId: p.id });
    expect(res.events).toContainEqual({ type: 'resign', staffId: p.id, name: p.name, fired: true });
  });

  it('refuses founders and unknown ids', () => {
    const s = game();
    expectFail(expect, dispatch, s, { type: 'fire', staffId: s.staff[0].id }, 'Founders cannot be fired');
    expectFail(expect, dispatch, s, { type: 'fire', staffId: 'nope' }, 'No such staff member');
  });

  it('removes the person and clears mentor links targeting them', () => {
    const s = game();
    const j = addStaff(s, 'engineer', 'junior');
    const senior = s.staff[0];
    expect(dispatch(s, { type: 'assign', staffId: senior.id, assignment: { type: 'mentor', targetId: j.id } }).ok).toBe(true);
    expect(dispatch(s, { type: 'fire', staffId: j.id }).ok).toBe(true);
    expect(s.staff.find((p) => p.id === j.id)).toBeUndefined();
    expect(senior.assignment.type).not.toBe('mentor');
  });
});

describe('assign', () => {
  it('validates mentor, hardProblem, project, sabbatical, and unknown types', () => {
    const s = game();
    const [senior, designer] = s.staff;
    const j = addStaff(s, 'engineer', 'junior');
    const j2 = addStaff(s, 'engineer', 'junior');
    const as = (staffId, type, targetId = null) => ({ type: 'assign', staffId, assignment: { type, targetId } });
    expectFail(expect, dispatch, s, as(j.id, 'mentor', j2.id), 'Only mids and seniors can mentor');
    expectFail(expect, dispatch, s, as(senior.id, 'mentor', designer.id), 'Mentors need a junior to mentor');
    expectFail(expect, dispatch, s, as(senior.id, 'mentor', senior.id), 'Mentors need a junior to mentor');
    expectFail(expect, dispatch, s, as(designer.id, 'hardProblem'), 'Hard problems need a senior');
    expectFail(expect, dispatch, s, as(senior.id, 'project', 'nope'), 'No such project');
    expectFail(expect, dispatch, s, as(senior.id, 'sabbatical'), 'Needs the Sabbatical Program');
    expectFail(expect, dispatch, s, as(senior.id, 'napping'), 'Unknown assignment');
    expectFail(expect, dispatch, s, as('nope', 'idle'), 'No such staff member');
    expect(dispatch(s, as(senior.id, 'mentor', j.id)).ok).toBe(true);
    expect(dispatch(s, as(senior.id, 'hardProblem')).ok).toBe(true);
    expect(senior.assignment).toEqual({ type: 'hardProblem', targetId: null });
  });

  it('rejects a second mentor for the same junior', () => {
    const s = game();
    const j = addStaff(s, 'engineer', 'junior');
    const m2 = addStaff(s, 'engineer', 'mid');
    const as = (staffId) => ({ type: 'assign', staffId, assignment: { type: 'mentor', targetId: j.id } });
    expect(dispatch(s, as(s.staff[0].id)).ok).toBe(true);
    expectFail(expect, dispatch, s, as(m2.id), 'Already has a mentor');
    expect(dispatch(s, as(s.staff[0].id)).ok).toBe(true);
  });

  it('a mentee going on sabbatical ends the mentorship and gains no xp while away', () => {
    const s = game();
    s.policies.sabbatical = true;
    const j = addStaff(s, 'engineer', 'junior', { traits: [] });
    const m = s.staff[0];
    dispatch(s, { type: 'assign', staffId: m.id, assignment: { type: 'mentor', targetId: j.id } });
    expect(dispatch(s, { type: 'assign', staffId: j.id, assignment: { type: 'sabbatical', targetId: null } }).ok).toBe(true);
    expect(m.assignment.type).not.toBe('mentor');
    m.assignment = { type: 'mentor', targetId: j.id };
    upkeep(s, 2);
    expect(j.xp).toBe(0);
  });

  it('sabbatical sends the person away', () => {
    const s = game();
    s.policies.sabbatical = true;
    const p = addStaff(s, 'engineer', 'mid');
    expect(dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'sabbatical', targetId: null } }).ok).toBe(true);
    expect(p.mood).toBe('away');
    expect(p.sabbaticalWeeksLeft).toBe(B.sabbaticalWeeks);
    expectFail(expect, dispatch, s, { type: 'assign', staffId: p.id, assignment: { type: 'idle', targetId: null } }, 'They are on sabbatical');
    upkeep(s, B.sabbaticalWeeks);
    expect(p.mood).toBe('ok');
    expect(p.assignment.type).toBe('maintenance');
  });
});

describe('train', () => {
  it('costs cash and adds xp', () => {
    const s = game();
    const p = s.staff[0];
    const res = dispatch(s, { type: 'train', staffId: p.id });
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(B.startCash - B.trainingCost);
    expect(p.xp).toBe(B.trainingXp * staffMods(p).xp);
    expect(res.events[0]).toMatchObject({ type: 'bubble', staffId: p.id, tone: 'good' });
    s.cash = 5;
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id }, 'Not enough cash');
  });
});

describe('outputMult', () => {
  it('scales with seniority and mood', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'mid', { traits: [], speed: 1 });
    expect(outputMult(s, p)).toBe(1);
    p.mood = 'burnout';
    expect(outputMult(s, p)).toBeCloseTo(B.burnoutOutput);
    p.mood = 'away';
    expect(outputMult(s, p)).toBe(0);
    p.mood = 'ok';
    p.stamina = 10;
    expect(outputMult(s, p)).toBeCloseTo(0.7);
  });
});

describe('staff upkeep', () => {
  const juniorXpAfter = (engLevel, mentored) => {
    const s = game(3);
    s.automation.engineering.level = engLevel;
    const j = addStaff(s, 'engineer', 'junior', { traits: [], level: 1 });
    if (mentored) s.staff[0].assignment = { type: 'mentor', targetId: j.id };
    s.staff[0].traits = [];
    upkeep(s, 5);
    return j.xp + 60 * (j.level - 1);
  };

  it('an unmentored junior levels slower under automation; a mentored one faster than both', () => {
    const none = juniorXpAfter(0, false);
    const full = juniorXpAfter(1, false);
    const mentored = juniorXpAfter(1, true);
    expect(full).toBeLessThan(none);
    expect(mentored).toBeGreaterThan(none);
  });

  it('a junior is promoted to mid after enough weeks', () => {
    const s = game();
    const j = addStaff(s, 'engineer', 'junior', { traits: [], level: 1 });
    upkeep(s, 120);
    expect(j.seniority).not.toBe('junior');
    expect(j.level).toBeGreaterThanOrEqual(B.promoteMidLevel);
    expect(j.salary).toBeGreaterThanOrEqual(B.salary.mid * 0.8);
  });

  it('promotion ends a mentorship targeting the promoted person', () => {
    const s = game();
    const j = addStaff(s, 'engineer', 'junior', { traits: [], level: 4, xp: 239 });
    s.staff[0].assignment = { type: 'mentor', targetId: j.id };
    upkeep(s, 1);
    expect(j.seniority).toBe('mid');
    expect(s.staff[0].assignment.type).not.toBe('mentor');
  });

  it('stamina drains while working and recovers while idle', () => {
    const s = game();
    const [a, b] = s.staff;
    a.assignment = { type: 'maintenance', targetId: null };
    a.traits = []; b.traits = [];
    b.stamina = 50;
    upkeep(s, 3);
    expect(a.stamina).toBeLessThan(100);
    expect(b.stamina).toBeGreaterThan(50);
  });

  it('refreshes candidates every few weeks', () => {
    const s = game();
    const first = s.candidates.map((c) => c.id).join();
    upkeep(s, B.candidateRefreshWeeks);
    expect(s.candidates.map((c) => c.id).join()).toBe(first);
    upkeep(s, 1);
    expect(s.candidates.map((c) => c.id).join()).not.toBe(first);
    expect(s.candidatesWeek).toBe(B.candidateRefreshWeeks);
  });

  it('apprenticeship gives juniors better skills', () => {
    const a = game(4);
    const b = game(4);
    b.policies.apprenticeship = true;
    refreshCandidates(a);
    refreshCandidates(b);
    const juniors = (s) => s.candidates.filter((c) => c.seniority === 'junior');
    expect(juniors(a).length).toBeGreaterThan(0);
    for (let i = 0; i < juniors(a).length; i++) {
      for (const k of Object.keys(juniors(a)[i].skills)) expect(juniors(b)[i].skills[k]).toBe(juniors(a)[i].skills[k] + 10);
    }
  });

  it('runs as part of tick deterministically', () => {
    const a = game(11);
    const b = game(11);
    advance(a, 30, tick, dispatch);
    advance(b, 30, tick, dispatch);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.candidatesWeek).toBeGreaterThan(0);
  });
});
