import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { checkUnlocks, lockedReason } from '../../src/sim/unlocks.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { rogueRisk } from '../../src/sim/incidents.js';
import { competition } from '../../src/sim/products.js';
import { UNLOCKS, UNLOCK_KEYS } from '../../src/data/unlocks.js';
import { POLICIES } from '../../src/data/policies.js';
import { B } from '../../src/sim/balance.js';
import { classicGame, addStaff, addProduct, expectFail, advance, addDesks } from './helpers.js';

const unlocksOf = (events) => events.filter((e) => e.type === 'unlock').map((e) => e.key);
const check = (s) => { const c = makeCtx(s); checkUnlocks(c); return c.events; };

describe('unlock data', () => {
  it('covers the contract keys with a reason and an explainer each', () => {
    expect(UNLOCK_KEYS.sort()).toEqual(['automation', 'marketing', 'meaning', 'models', 'ops', 'paths', 'research', 'standups']);
    for (const u of UNLOCKS) {
      expect(u.reason.length, u.key).toBeGreaterThan(5);
      expect(u.explainer.length, u.key).toBeGreaterThan(40);
    }
    for (const p of Object.values(POLICIES)) expect(p.lockText, p.id).not.toBe('Always available');
  });
});

describe('a fresh company starts with the basics only', () => {
  it('locked systems refuse with a reason and leave state alone', () => {
    const s = classicGame();
    addProduct(s, { model: null, angle: 'web' });
    expectFail(expect, dispatch, s, { type: 'runCampaign', channel: 'launch', productId: s.products[0].id }, 'Unlocks with your first launch');
    expectFail(expect, dispatch, s, { type: 'buyAudit' }, 'Unlocks after your first incident');
    expectFail(expect, dispatch, s, { type: 'setTooling', on: true }, 'Unlocks after your first incident');
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'ci_cd' }, 'Unlocks with your third launch');
    expectFail(expect, dispatch, s, { type: 'setAutomation', fn: 'support', level: 0.5 }, 'Arrives with the ChatGBT moment');
    expectFail(expect, dispatch, s, { type: 'setPolicy', id: 'daily_standups', on: true }, 'Unlocks at 5 people');
    expectFail(expect, dispatch, s, { type: 'setPolicy', id: 'pair', on: true }, 'Arrives with the ChatGBT moment');
    const senior = s.staff.find((p) => p.seniority === 'senior');
    senior.pathPending = true;
    expectFail(expect, dispatch, s, { type: 'choosePath', staffId: senior.id, pathId: 'architect' }, 'Unlocks when someone is promoted to senior');
    expect(dispatch(s, { type: 'setTooling', on: false }).ok).toBe(true);
  });

  it('nothing is unlocked on week 0, and ticking a quiet week opens nothing', () => {
    const s = classicGame();
    expect(s.unlocks).toEqual({});
    expect(unlocksOf(tick(s))).toEqual([]);
    expect(s.unlocks).toEqual({});
  });
});

describe('triggers', () => {
  it('marketing opens at the first launch, research at the third', () => {
    const s = classicGame();
    s.stats.launches = 1;
    expect(unlocksOf(check(s))).toEqual(['marketing']);
    expect(s.unlocks.marketing).toBe(s.week);
    expect(unlocksOf(check(s))).toEqual([]);
    s.stats.launches = 3;
    s.week += B.unlockGapWeeks;
    expect(unlocksOf(check(s))).toEqual(['research']);
    expect(lockedReason(s, 'research')).toBe(null);
    expect(dispatch(s, { type: 'startProject', kind: 'research', researchId: 'ci_cd' }).ok).toBe(true);
  });

  it('AI research waits for the Agents era even once research is open', () => {
    const s = classicGame();
    s.unlocks.research = 0;
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'eval_harness' }, 'Arrives with the Agents era');
    s.era = { id: 'agents', since: 0 };
    expect(dispatch(s, { type: 'startProject', kind: 'research', researchId: 'eval_harness' }).ok).toBe(true);
  });

  it('ops opens after the first incident', () => {
    const s = classicGame();
    s.stats.incidents = 1;
    expect(unlocksOf(check(s))).toContain('ops');
    expect(dispatch(s, { type: 'buyAudit' }).ok).toBe(true);
  });

  it('standups and both standup policies open together, as one card, the moment the fifth person is hired', () => {
    const s = classicGame();
    s.cash = 1e6;
    s.unlocks['policy.craft_fridays'] = 0;
    addDesks(s, 5);
    for (let i = 0; i < 2; i++) addStaff(s, 'engineer', 'mid');
    const res = dispatch(s, { type: 'hire', candidateId: s.candidates[0].id });
    expect(res.ok).toBe(true);
    expect(unlocksOf(res.events)).toEqual(['standups']);
    expect(s.unlocks['policy.daily_standups']).toBe(0);
    expect(dispatch(s, { type: 'setPolicy', id: 'daily_standups', on: true }).ok).toBe(true);
  });

  it('non-era unlocks arrive one at a time, at least the gap apart', () => {
    const s = classicGame();
    s.stats.launches = 3;
    s.stats.incidents = 1;
    addDesks(s, 4);
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'senior');
    s.flags.firstSeniorWeek = 0;
    s.officeStage = 1;
    const seen = [];
    for (let w = 0; w < 80; w++) {
      s.week = w;
      for (const k of unlocksOf(check(s))) seen.push([k, w]);
    }
    expect(seen.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < seen.length; i++) expect(seen[i][1] - seen[i - 1][1]).toBeGreaterThanOrEqual(B.unlockGapWeeks);
    expect(seen.map(([k]) => k).slice(0, 4)).toEqual(['marketing', 'ops', 'research', 'paths']);
  });

  it('era unlocks skip the spacing', () => {
    const s = classicGame();
    s.stats.launches = 1;
    check(s);
    s.era = { id: 'chatgbt', since: 1 };
    s.week = 1;
    expect(unlocksOf(check(s))).toEqual(['models', 'automation', 'meaning', 'policy.pair']);
  });

  it('a policy stays usable once unlocked even if its trigger lapses', () => {
    const s = classicGame();
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    check(s);
    expect(s.unlocks.standups).toBe(0);
    s.staff.splice(2);
    expect(dispatch(s, { type: 'setPolicy', id: 'daily_standups', on: true }).ok).toBe(true);
  });

  it('career paths open at the first promotion to senior, not at a senior hire', () => {
    const s = classicGame();
    expect(unlocksOf(check(s))).not.toContain('paths');
    addStaff(s, 'engineer', 'senior');
    expect(unlocksOf(check(s))).not.toContain('paths');
    const t = classicGame();
    t.flags.firstSeniorWeek = 3;
    expect(unlocksOf(check(t))).toContain('paths');
  });

  it('models and automation arrive with the ChatGBT moment, during the tick', () => {
    const s = classicGame(5);
    s.stats.launches = 1;
    s.week = s.eraSchedule.chatgbt;
    const ev = tick(s);
    expect(ev).toContainEqual({ type: 'era', eraId: 'chatgbt' });
    expect(unlocksOf(ev)).toEqual(expect.arrayContaining(['models', 'automation', 'policy.pair']));
    expect(dispatch(s, { type: 'setAutomation', fn: 'marketing', level: 0.25, model: 'chatgbt' }).ok).toBe(true);
  });

  it('unlock events carry only contract keys', () => {
    const s = classicGame(3);
    s.cash = 1e7;
    s.officeStage = 1;
    addDesks(s, 6);
    const keys = [];
    for (let w = 0; w < 400; w++) {
      if (s.staff.length < 6) keys.push(...unlocksOf(dispatch(s, { type: 'hire', candidateId: s.candidates[0]?.id }).events));
      for (let c = 0; c < 4 && s.pendingDecision; c++) keys.push(...unlocksOf(dispatch(s, { type: 'resolveDecision', choice: c }).events));
      keys.push(...unlocksOf(tick(s)));
      s.cash = Math.max(s.cash, 1e7);
    }
    const allowed = new Set([...UNLOCK_KEYS, ...Object.keys(POLICIES).map((id) => `policy.${id}`)]);
    for (const k of keys) expect(allowed.has(k), k).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys, keys.join()).toEqual(expect.arrayContaining(['standups', 'models', 'automation']));
  });
});

describe('era pressure', () => {
  it('rogue agents only exist from the Agents era on', () => {
    const s = classicGame();
    s.automation.support = { level: 0.5, model: 'grokk' };
    s.era = { id: 'chatgbt', since: 0 };
    expect(rogueRisk(s, 'support')).toBe(0);
    s.era = { id: 'agents', since: 0 };
    expect(rogueRisk(s, 'support')).toBeGreaterThan(0);
  });

  it('incumbents and clones press harder each era', () => {
    const s = classicGame();
    const p = addProduct(s, { model: null, angle: 'web' });
    s.market.categories.email.clones = 2;
    const seen = [];
    for (const id of ['classic', 'chatgbt', 'agents', 'consolidation']) {
      s.era = { id, since: 0 };
      const c = competition(s, p);
      seen.push(c.incumbent + c.clones);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(B.eraCompetition.classic).toBe(1);
  });

  it('consolidation brings vendor releases twice as often', () => {
    const count = (era) => {
      const s = classicGame();
      s.era = { id: era, since: 0 };
      for (const m of Object.values(s.models)) m.available = true;
      s.eraSchedule = { chatgbt: 9999, agents: 9999, consolidation: 9999 };
      let n = 0;
      for (let w = 1; w <= 104; w++) {
        s.week = w;
        const c = makeCtx(s);
        calendarStart(c);
        n += c.events.filter((e) => e.type === 'chat' && e.from === '@vendorbot').length;
      }
      return n;
    };
    expect(count('consolidation')).toBeGreaterThanOrEqual(2 * count('agents'));
  });
});

describe('determinism', () => {
  it('the same seed gives the same eras, unlocks, and goals', () => {
    const play = () => {
      const s = createGame({ seed: 11 });
      advance(s, 260, tick, dispatch);
      return JSON.stringify([s.eraSchedule, s.era, s.unlocks, s.goals, s.rng, s.cash]);
    };
    expect(play()).toBe(play());
  });
});

describe('career paths wait for the unlock', () => {
  it('nobody has a path pending until paths unlock; then every senior does, founders included', () => {
    const s = classicGame();
    s.cash = 1e6;
    addDesks(s, 4);
    expect(s.staff.concat(s.candidates).some((p) => p.pathPending)).toBe(false);
    const senior = addStaff(s, 'engineer', 'senior');
    expect(senior.pathPending).toBe(false);
    s.flags.firstSeniorWeek = s.week;
    const ev = check(s);
    expect(unlocksOf(ev)).toContain('paths');
    const founder = s.staff.find((p) => p.founder && p.seniority === 'senior');
    expect(founder.pathPending).toBe(true);
    expect(senior.pathPending).toBe(true);
    expect(dispatch(s, { type: 'choosePath', staffId: founder.id, pathId: 'architect' }).ok).toBe(true);
    expect(founder.pathPending).toBe(false);
  });
});

describe('founders and career paths', () => {
  for (const founders of [['engineer', 'designer'], ['researcher', 'engineer']]) {
    it(`${founders.join(' + ')}: no path is pending at the start, and choosePath refuses with the lock reason`, () => {
      const s = createGame({ seed: 2, founders });
      for (const p of s.staff) {
        expect(p.pathPending, p.name).toBe(false);
        expectFail(expect, dispatch, s, { type: 'choosePath', staffId: p.id, pathId: 'architect' }, 'Unlocks when someone is promoted to senior');
      }
      s.flags.firstSeniorWeek = 0;
      check(s);
      for (const p of s.staff) expect(p.pathPending, p.name).toBe(p.seniority === 'senior');
    });
  }
});
