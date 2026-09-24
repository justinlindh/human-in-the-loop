import { describe, it, expect } from 'vitest';
import { dispatch, oversightRequired, oversightProvided } from '../../src/sim/index.js';
import { automationExposure } from '../../src/sim/automation.js';
import { meaningSystem } from '../../src/sim/meaning.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

const runMeaning = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); meaningSystem(c); ev.push(...c.events); s.week++; } return ev; };
const plain = (s, role, seniority, over = {}) => addStaff(s, role, seniority, { traits: [], speed: 1, meaning: 60, ...over });

describe('automation exposure', () => {
  it('maps roles to functions', () => {
    const s = game();
    const eng = plain(s, 'engineer', 'mid');
    const des = plain(s, 'designer', 'mid');
    const sup = plain(s, 'support', 'mid');
    s.automation.engineering.level = 1;
    expect(automationExposure(s, eng)).toBe(1);
    expect(automationExposure(s, des)).toBeCloseTo(0.35);
    expect(automationExposure(s, sup)).toBe(0);
    s.automation.qa.level = 0.5;
    s.automation.engineering.level = 0;
    expect(automationExposure(s, eng)).toBeCloseTo(0.25);
  });
});

describe('meaning drain and recovery', () => {
  const drainOver = (seniority, setup = () => {}) => {
    const s = game();
    s.automation.engineering.level = 1;
    const p = plain(s, 'engineer', seniority, { assignment: { type: 'maintenance', targetId: null } });
    setup(s, p);
    runMeaning(s, 5);
    return 60 - p.meaning;
  };

  it('a senior drains faster than a junior at equal exposure', () => {
    expect(drainOver('senior')).toBeGreaterThan(drainOver('junior'));
  });

  it('pair policy cuts drain to 30%', () => {
    const base = drainOver('mid');
    const paired = drainOver('mid', (s) => { s.policies.pair = true; });
    expect(paired / base).toBeCloseTo(B.pairMeaningDrainMult, 1);
  });

  it('mentoring halves drain and adds recovery', () => {
    const base = drainOver('senior');
    const mentoring = drainOver('senior', (s, p) => {
      const j = plain(s, 'engineer', 'junior');
      p.assignment = { type: 'mentor', targetId: j.id };
    });
    expect(mentoring).toBeLessThan(base / 2);
  });

  it('with zero automation, idle meaning trends upward', () => {
    const s = game();
    const p = plain(s, 'designer', 'mid', { assignment: { type: 'idle', targetId: null } });
    runMeaning(s, 10);
    expect(p.meaning).toBeGreaterThan(60);
  });

  it('owning a good product and craft fridays add recovery', () => {
    const s = game();
    s.automation.engineering.level = 1;
    const a = plain(s, 'engineer', 'mid', { assignment: { type: 'maintenance', targetId: null } });
    const b = plain(s, 'engineer', 'mid', { assignment: { type: 'maintenance', targetId: null } });
    addProduct(s, { score: 7, ownerId: b.id });
    runMeaning(s, 5);
    expect(b.meaning).toBeGreaterThan(a.meaning);
  });

  it('sabbatical restores meaning fast', () => {
    const s = game();
    const p = plain(s, 'engineer', 'senior', { mood: 'away', meaning: 20, sabbaticalWeeksLeft: 4, assignment: { type: 'sabbatical', targetId: null } });
    runMeaning(s, 2);
    expect(p.meaning).toBe(20 + 2 * B.meaningRecovery.sabbatical);
    expect(p.mood).toBe('away');
  });

  it('meaning stays within 0..100', () => {
    const s = game();
    s.automation.engineering.level = 1;
    const p = plain(s, 'engineer', 'senior', { meaning: 1, founder: true });
    const q = plain(s, 'designer', 'mid', { meaning: 99.9, assignment: { type: 'idle', targetId: null } });
    runMeaning(s, 5);
    expect(p.meaning).toBeGreaterThanOrEqual(0);
    expect(q.meaning).toBeLessThanOrEqual(100);
  });
});

describe('moods and resignations', () => {
  it('moods follow the thresholds and burnoutWeeks counts', () => {
    const s = game();
    const p = plain(s, 'engineer', 'mid', { meaning: 30 });
    runMeaning(s, 1);
    expect(p.mood).toBe('coasting');
    p.meaning = 10;
    runMeaning(s, 1);
    expect(p.mood).toBe('burnout');
    expect(p.burnoutWeeks).toBe(1);
  });

  it('every resignation is preceded by a warn toast naming that person', () => {
    let resignations = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = game(seed);
      s.automation.engineering.level = 1;
      for (let i = 0; i < 3; i++) plain(s, 'engineer', 'senior', { meaning: 80, assignment: { type: 'maintenance', targetId: null } });
      const firstWarn = {};
      for (let w = 0; w < 250; w++) {
        for (const e of runMeaning(s, 1)) {
          if (e.type === 'toast' && e.tone === 'warn') {
            const who = s.staff.find((p) => e.text.startsWith(p.name));
            if (who && !(who.name in firstWarn)) firstWarn[who.name] = w;
          }
          if (e.type === 'resign') {
            resignations++;
            expect(e.name in firstWarn, `seed ${seed}: ${e.name} quit without a warning`).toBe(true);
            expect(w - firstWarn[e.name], `seed ${seed}: ${e.name}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
    expect(resignations).toBeGreaterThan(5);
  });

  it('a burnout run makes a non-founder resign and never a founder', () => {
    const s = game(4);
    s.automation.engineering.level = 1;
    for (const f of s.staff) f.meaning = 0;
    for (let i = 0; i < 4; i++) plain(s, 'engineer', 'senior', { meaning: 0 });
    const ev = runMeaning(s, 60);
    const resigns = ev.filter((e) => e.type === 'resign');
    expect(resigns.length).toBeGreaterThan(0);
    expect(s.staff.filter((p) => p.founder)).toHaveLength(2);
    expect(s.stats.resignations).toBe(resigns.length);
    const bye = ev.find((e) => e.type === 'chat' && resigns.some((r) => r.name === e.from));
    expect(bye).toMatchObject({ channel: 'general', replyTo: null });
    expect(resigns.some((r) => r.staffId === bye.fromId)).toBe(true);
  });

  it('a resignation clears mentor links to the leaver', () => {
    const s = game(4);
    s.automation.engineering.level = 1;
    const j = plain(s, 'engineer', 'junior', { meaning: 0, traits: ['job_hopper'] });
    const m = s.staff[0];
    m.assignment = { type: 'mentor', targetId: j.id };
    for (let i = 0; i < 200 && s.staff.includes(j); i++) { j.meaning = 0; runMeaning(s, 1); }
    expect(s.staff.includes(j)).toBe(false);
    expect(m.assignment.type).not.toBe('mentor');
  });

});

describe('oversight', () => {
  it('required rises with level and falls with guardrails', () => {
    const s = game();
    expect(oversightRequired(s)).toBe(0);
    s.automation.engineering = { level: 0.5, model: 'claudius' };
    const half = oversightRequired(s);
    s.automation.engineering.level = 1;
    const full = oversightRequired(s);
    expect(full).toBeGreaterThan(half);
    s.automation.engineering.model = 'grokk';
    expect(oversightRequired(s)).toBeGreaterThan(full);
  });

  it('provided counts overseers and is written to ops weekly', () => {
    const s = game();
    const p = plain(s, 'engineer', 'mid', { assignment: { type: 'oversight', targetId: null } });
    expect(oversightProvided(s)).toBeCloseTo(B.oversightHoursPerPerson);
    p.traits = ['paranoid'];
    expect(oversightProvided(s)).toBeCloseTo(B.oversightHoursPerPerson * 1.4);
    s.automation.support.level = 1;
    runMeaning(s, 1);
    expect(s.ops.oversightRequired).toBeCloseTo(oversightRequired(s));
    expect(s.ops.oversightProvided).toBeGreaterThan(0);
  });
});

describe('setAutomation and setPolicy', () => {
  it('snaps levels and validates function and model', () => {
    const s = game();
    expect(dispatch(s, { type: 'setAutomation', fn: 'qa', level: 0.6, model: 'claudius' }).ok).toBe(true);
    expect(s.automation.qa).toEqual({ level: 0.5, model: 'claudius' });
    expect(dispatch(s, { type: 'setAutomation', fn: 'qa', level: 7 }).ok).toBe(true);
    expect(s.automation.qa).toEqual({ level: 1, model: 'claudius' });
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'vibes', level: 1 }, 'Unknown function');
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'qa', level: 'lots' }, 'Invalid level');
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'qa', level: 1, model: 'mistrale' }, 'Model is not available');
  });

  it('turning a function off or changing only the level skips the model check', () => {
    const s = game();
    dispatch(s, { type: 'setAutomation', fn: 'support', level: 1, model: 'grokk' });
    s.models.grokk.deprecated = true;
    expect(dispatch(s, { type: 'setAutomation', fn: 'support', level: 0.5 }).ok).toBe(true);
    expect(dispatch(s, { type: 'setAutomation', fn: 'support', level: 0, model: 'grokk' }).ok).toBe(true);
    expect(s.automation.support).toEqual({ level: 0, model: 'grokk' });
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'qa', level: 1, model: 'grokk' }, 'Model is not available');
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'qa', level: 0, model: 'mistrale' }, 'Model is not available');
  });

  it('a locked policy cannot be turned on; turning off always works', () => {
    const s = game();
    expectFail(expect, dispatch, s, { type: 'setPolicy', id: 'apprenticeship', on: true }, 'Needs the Office Floor');
    expectFail(expect, dispatch, s, { type: 'setPolicy', id: 'nope', on: true }, 'Unknown policy');
    expect(dispatch(s, { type: 'setPolicy', id: 'pair', on: true }).ok).toBe(true);
    expect(s.policies.pair).toBe(true);
    expect(dispatch(s, { type: 'setPolicy', id: 'pair', on: false }).ok).toBe(true);
    expect(s.policies.pair).toBeUndefined();
    s.officeStage = 1;
    expect(dispatch(s, { type: 'setPolicy', id: 'apprenticeship', on: true }).ok).toBe(true);
  });
});
