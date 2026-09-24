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
    run(t, 20);
    expect(t.comprehensionDebt).toBe(0);
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
