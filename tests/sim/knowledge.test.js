import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { knowledgeSystem, onDeparture } from '../../src/sim/knowledge.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addProduct } from './helpers.js';

const run = (s, n = 1) => { for (let i = 0; i < n; i++) { knowledgeSystem(makeCtx(s)); s.week++; } };
const eng = (s, seniority, knowledge, type = 'maintenance') => addStaff(s, 'engineer', seniority, { knowledge, traits: [], assignment: { type, targetId: null } });

describe('staff knowledge', () => {
  it('grows while working and slower under engineering automation', () => {
    const a = game();
    const b = game();
    b.automation.engineering.level = 1;
    const pa = eng(a, 'mid', 20);
    const pb = eng(b, 'mid', 20);
    run(a, 10);
    run(b, 10);
    expect(pa.knowledge).toBeCloseTo(20 + 10 * B.knowledgeGainWorking);
    expect(pb.knowledge).toBeCloseTo(20 + 10 * B.knowledgeGainWorking * 0.3);
  });

  it('idle people learn nothing; mentored juniors learn extra; cap 100', () => {
    const s = game();
    const idle = eng(s, 'mid', 20, 'idle');
    const j = eng(s, 'junior', 20);
    s.staff[0].assignment = { type: 'mentor', targetId: j.id };
    const top = eng(s, 'senior', 99.9);
    run(s, 4);
    expect(idle.knowledge).toBe(20);
    expect(j.knowledge).toBeCloseTo(20 + 4 * (B.knowledgeGainWorking + B.knowledgeGainMentee));
    expect(top.knowledge).toBe(100);
  });
});

describe('institutional knowledge', () => {
  it('drops when a high-knowledge senior leaves', () => {
    const s = game();
    addProduct(s);
    const vet = eng(s, 'senior', 95);
    run(s, 1);
    const before = s.institutionalKnowledge;
    s.staff = s.staff.filter((p) => p !== vet);
    onDeparture(s, vet);
    run(s, 1);
    expect(s.institutionalKnowledge).toBeLessThan(before - 10);
  });

  it('fire triggers the departure debt', () => {
    const s = game();
    const vet = eng(s, 'senior', 80);
    dispatch(s, { type: 'fire', staffId: vet.id });
    expect(s.comprehensionDebt).toBeCloseTo(80 * B.debtFromDeparturePerKnowledge);
  });

  it('shrinks as the product count grows', () => {
    const s = game();
    run(s, 1);
    const none = s.institutionalKnowledge;
    for (let i = 0; i < 5; i++) addProduct(s);
    run(s, 1);
    expect(s.institutionalKnowledge).toBeLessThan(none);
  });
});

describe('comprehension debt', () => {
  it('rises under full engineering automation with no seniors', () => {
    const s = game();
    s.staff = [];
    s.automation.engineering.level = 1;
    addProduct(s);
    run(s, 10);
    expect(s.comprehensionDebt).toBeGreaterThan(5);
  });

  it('falls with two knowledgeable senior engineers plus reviews', () => {
    const s = game();
    s.comprehensionDebt = 50;
    s.policies.comprehension_reviews = true;
    eng(s, 'senior', 90);
    eng(s, 'senior', 90);
    addProduct(s);
    run(s, 10);
    expect(s.comprehensionDebt).toBeLessThan(40);
  });

  it('is clamped to [0, 100]', () => {
    const s = game();
    s.staff = [];
    s.automation = Object.fromEntries(Object.keys(s.automation).map((fn) => [fn, { level: 1, model: 'grokk' }]));
    for (let i = 0; i < 10; i++) addProduct(s);
    run(s, 300);
    expect(s.comprehensionDebt).toBe(100);
    const t = game();
    t.comprehensionDebt = 1;
    t.policies.comprehension_reviews = true;
    eng(t, 'senior', 100);
    run(t, 200);
    expect(t.comprehensionDebt).toBeGreaterThanOrEqual(0);
    expect(t.comprehensionDebt).toBeLessThan(0.1);
  });

  it('stays finite with zero products and zero staff', () => {
    const s = game();
    s.staff = [];
    run(s, 20);
    expect(Number.isFinite(s.institutionalKnowledge)).toBe(true);
    expect(Number.isFinite(s.comprehensionDebt)).toBe(true);
    expect(s.institutionalKnowledge).toBe(0);
  });
});

describe('comprehension debt from project work (#936)', () => {
  const project = (s, kind = 'new') => { const j = { id: `j${s.nextId++}`, kind, progress: 0, pointsNeeded: 999 }; s.projects.push(j); return j; };
  const builder = (s, seniority, j) => addStaff(s, 'engineer', seniority, { knowledge: 0, traits: [], assignment: { type: 'project', targetId: j.id } });
  const once = (setup) => { const s = game(); s.staff = []; setup(s); run(s, 1); return s; };

  it('each builder-week on a shipping project adds debt, weighted by seniority', () => {
    const mid = once((s) => builder(s, 'mid', project(s)));
    expect(mid.debtFlow.work).toBeCloseTo(B.debtPerBuildWeek * B.debtBuildWeight.mid);
    const juniors = once((s) => { const j = project(s); builder(s, 'junior', j); builder(s, 'junior', j); });
    const seniors = once((s) => { const j = project(s); builder(s, 'senior', j); builder(s, 'senior', j); });
    expect(juniors.debtFlow.work).toBeGreaterThan(seniors.debtFlow.work);
  });

  it('crunch makes the same work add more', () => {
    const calm = once((s) => builder(s, 'mid', project(s)));
    const crunch = once((s) => { s.policies.crunch = true; builder(s, 'mid', project(s)); });
    expect(crunch.debtFlow.work).toBeCloseTo(calm.debtFlow.work * B.debtCrunchMult);
  });

  it('a refactor or craft project adds none', () => {
    const s = once((g) => { builder(g, 'mid', project(g, 'refactor')); builder(g, 'mid', project(g, 'craft')); });
    expect(s.debtFlow.work).toBe(0);
  });

  it('reviews and seniors pay down a share of the debt, reviews the most', () => {
    const at = (debt, setup) => { const s = game(); s.staff = []; s.comprehensionDebt = debt; setup(s); run(s, 1); return s.debtFlow; };
    const reviews = at(40, (s) => { s.policies.comprehension_reviews = true; });
    const senior = at(40, (s) => eng(s, 'senior', 100));
    expect(reviews.reviews).toBeCloseTo(-40 * B.debtPaydownReviews);
    expect(senior.seniors).toBeCloseTo(-40 * B.debtPaydownPerSeniorEng);
    expect(reviews.reviews).toBeLessThan(senior.seniors);
    expect(at(20, (s) => { s.policies.comprehension_reviews = true; }).reviews).toBeCloseTo(reviews.reviews / 2);
  });

  it('debtFlow names every source, finite, and oneOff carries a departure', () => {
    const s = game();
    run(s, 1);
    expect(Object.keys(s.debtFlow).sort()).toEqual(['automation', 'lowKnowledge', 'maintenance', 'net', 'oneOff', 'products', 'reviews', 'seniors', 'work']);
    const vet = eng(s, 'senior', 80);
    dispatch(s, { type: 'fire', staffId: vet.id });
    run(s, 1);
    expect(s.debtFlow.oneOff).toBeCloseTo(80 * B.debtFromDeparturePerKnowledge);
    const sources = Object.entries(s.debtFlow).filter(([k]) => k !== 'net').reduce((a, [, v]) => a + v, 0);
    expect(s.debtFlow.net).toBeCloseTo(sources);
    for (const v of Object.values(s.debtFlow)) expect(Number.isFinite(v)).toBe(true);
  });

  it('net is the change after the clamp: paydown at zero debt reads zero net', () => {
    const s = game();
    s.policies.comprehension_reviews = true;
    eng(s, 'senior', 100);
    run(s, 2);
    expect(s.comprehensionDebt).toBe(0);
    expect(s.debtFlow.net).toBe(0);
  });

  it('oneOff records the amount asked for, even where the clamp stops it', async () => {
    const { bumpDebt } = await import('../../src/sim/debt.js');
    const low = game();
    run(low, 1);
    low.comprehensionDebt = 0;
    low.flags.debtAfterKnowledge = 0;
    bumpDebt(low, -3);
    run(low, 1);
    expect(low.debtFlow.oneOff).toBe(-3);
    expect(low.comprehensionDebt).toBeGreaterThanOrEqual(0);
    const high = game();
    run(high, 1);
    high.comprehensionDebt = 100;
    high.flags.debtAfterKnowledge = 100;
    const vet = eng(high, 'senior', 80);
    dispatch(high, { type: 'fire', staffId: vet.id });
    expect(high.comprehensionDebt).toBe(100);
    run(high, 1);
    expect(high.debtFlow.oneOff).toBeCloseTo(80 * B.debtFromDeparturePerKnowledge);
    run(high, 1);
    expect(high.debtFlow.oneOff).toBe(0);
  });

  it('a senior on maintenance pays down in both seniors and maintenance, each once', () => {
    const s = game();
    s.staff = [];
    s.comprehensionDebt = 50;
    eng(s, 'senior', 100, 'maintenance');
    run(s, 1);
    expect(s.debtFlow.seniors).toBeCloseTo(-50 * B.debtPaydownPerSeniorEng);
    expect(s.debtFlow.maintenance).toBeCloseTo(-50 * B.debtPaydownMaintenance);
  });

  it('a new game starts with an all-zero debtFlow', async () => {
    const { createGame } = await import('../../src/sim/index.js');
    const s = createGame({ seed: 3, companyName: 'Zero' });
    expect(Object.values(s.debtFlow).every((v) => v === 0)).toBe(true);
  });
});
