import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { strainSystem, strainDelta } from '../../src/sim/strain.js';
import { meaningSystem } from '../../src/sim/meaning.js';
import { purposeSystem, purposeLift } from '../../src/sim/purpose.js';
import { incentivesSystem } from '../../src/sim/incentives.js';
import { checkUnlocks } from '../../src/sim/unlocks.js';
import { raiseDecision } from '../../src/sim/events.js';
import { productAppeal } from '../../src/sim/products.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { INCENTIVES } from '../../src/data/incentives.js';
import { game, classicGame, addStaff, addProduct, addDesks, expectFail } from './helpers.js';

const run = (s, sys) => { const c = makeCtx(s); sys(c); return c.events; };
const choose = (s, label) => {
  const i = EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label);
  return dispatch(s, { type: 'resolveDecision', choice: i });
};

describe('strain (issue #12)', () => {
  it('builds under real load, warns once, and burns people out even when meaning is fine', () => {
    const s = game(2);
    const p = addStaff(s, 'engineer', 'mid', { stamina: 10, meaning: 80, assignment: { type: 'maintenance', targetId: null } });
    const q = addProduct(s);
    s.outage = { productId: q.id, kind: 'ransomware', severity: 3, weeks: 1, unrecoverable: false };
    const rested = strainDelta(s, { ...p, stamina: 90 }, 0);
    expect(strainDelta(s, p, 0)).toBeGreaterThan(rested);
    let warned = 0;
    for (let w = 0; w < 40 && p.mood !== 'burnout'; w++) {
      warned += run(s, strainSystem).filter((e) => e.type === 'toast' && e.text === `${p.name} looks exhausted.`).length;
      run(s, meaningSystem);
    }
    expect(warned).toBe(1);
    expect(p.strain).toBeGreaterThanOrEqual(B.strainBurnout);
    expect(p.meaning).toBeGreaterThan(B.burnoutBelow);
    expect(p.mood).toBe('burnout');
  });

  it('time off takes someone away for two weeks and strain falls fast', () => {
    const s = game(3);
    const p = addStaff(s, 'engineer', 'mid', { strain: 90 });
    expectFail(expect, dispatch, s, { type: 'timeOff', staffId: 'nope' }, 'No such staff member');
    expect(dispatch(s, { type: 'timeOff', staffId: p.id }).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'timeOff', staffId: p.id }, 'They are away');
    for (let w = 0; w < 3; w++) tick(s);
    expect(p.mood).not.toBe('away');
    expect(p.strain).toBeLessThanOrEqual(90 - 2 * B.strainRecoverAway + 10);
  });

  it('No Crunch halves how fast strain builds', () => {
    const s = game(4);
    const p = addStaff(s, 'engineer', 'mid', { stamina: 10, assignment: { type: 'maintenance', targetId: null } });
    const plain = strainDelta(s, p, 0);
    s.policies.no_crunch = true;
    expect(strainDelta(s, p, 0)).toBeCloseTo(plain * B.noCrunchStrainMult + (plain < 0 ? plain * (1 - B.noCrunchStrainMult) : 0));
  });
});

describe('meaning and purpose (issue #7)', () => {
  it('meaning unlocks with the ChatGBT moment', () => {
    const s = classicGame(2);
    s.stats.launches = 1;
    run(s, checkUnlocks);
    expect(s.unlocks.meaning).toBeUndefined();
    s.era = { id: 'chatgbt', since: s.week };
    const ev = run(s, checkUnlocks);
    expect(ev).toContainEqual({ type: 'unlock', key: 'meaning' });
  });

  it('the mission decision arrives a couple of months into Agents, and later decisions test it', () => {
    const s = game(5);
    s.era = { id: 'agents', since: 100 };
    s.week = 100 + B.missionAfterWeeks - 1;
    run(s, purposeSystem);
    expect(s.pendingDecision).toBe(null);
    s.week++;
    run(s, purposeSystem);
    expect(s.pendingDecision.eventId).toBe('mission_statement');
    choose(s, 'A place where people grow');
    expect(s.purpose).toEqual({ value: B.purposeStart.people, mission: 'people', tests: [] });
    s.week += 10;
    delete s.flags.lastDecisionWeek;
    addStaff(s, 'support', 'mid');
    raiseDecision(makeCtx(s), 'mission_test_support');
    choose(s, 'Hand support to the agents');
    expect(s.purpose.value).toBe(B.purposeStart.people - 10);
    expect(s.purpose.tests).toEqual([{ week: s.week, text: 'Humans on the phones?', delta: -10 }]);
    expect(purposeLift(s)).toBeLessThan(0);
  });

  it('high Purpose helps meaning recovery, and in the Plateau it lifts appeal', () => {
    const s = game(6);
    const p = addProduct(s);
    s.era = { id: 'plateau', since: 0 };
    const flat = productAppeal(s, p);
    s.purpose = { value: 90, mission: 'craft', tests: [] };
    expect(productAppeal(s, p)).toBeGreaterThan(flat);
    s.purpose.value = 10;
    expect(productAppeal(s, p)).toBeLessThan(flat);
  });
});

describe('the Incentives Program (issue #11)', () => {
  function program(seed = 7) {
    const s = game(seed);
    addDesks(s, 4);
    for (let i = 0; i < 6; i++) addStaff(s, 'engineer', 'mid');
    s.policies.incentives = true;
    s.purpose = { value: 60, mission: 'people', tests: [] };
    return s;
  }

  it('climbs the reward ladder with staged talk, and each reward buys less', () => {
    const s = program();
    const rewards = [];
    const boosts = [];
    for (let w = 0; w < B.incentiveEveryWeeks * 7; w++) {
      const ev = run(s, incentivesSystem);
      const inc = ev.find((e) => e.type === 'incentive');
      if (inc) {
        rewards.push(inc.reward);
        boosts.push(s.modifiers.filter((m) => m.label === 'Incentives Program').at(-1)?.value ?? 0);
        const says = ev.filter((e) => e.type === 'say');
        expect(says.length).toBeGreaterThanOrEqual(3);
        expect(says.some((e) => e.staffId === inc.staffId)).toBe(true);
        expect(says.filter((e) => e.staffId !== inc.staffId).every((e) => e.toId && e.toId !== inc.staffId)).toBe(true);
        expect(ev.some((e) => e.type === 'chat' && e.channel === 'random')).toBe(true);
        for (const e of ev) if (e.text) expect(e.text).not.toMatch(/[{}]/);
      }
      s.week++;
    }
    expect(rewards).toEqual(INCENTIVES.map((r) => r.id).concat('waffle_party'));
    for (let i = 1; i < boosts.length; i++) expect(boosts[i]).toBeLessThanOrEqual(boosts[i - 1]);
    expect(s.purpose.value).toBeLessThan(60);
  });

  it('is off unless the policy is on, and the policy unlocks with a real team', () => {
    const s = program();
    s.policies = {};
    for (let w = 0; w < 30; w++) { expect(run(s, incentivesSystem).some((e) => e.type === 'incentive')).toBe(false); s.week++; }
    const t = classicGame(8);
    for (let i = 0; i < 6; i++) addStaff(t, 'engineer', 'mid');
    t.stats.launches = 3;
    for (let w = 0; w < 80; w++) { t.week = w; run(t, checkUnlocks); }
    expect(t.unlocks['policy.incentives']).toBeDefined();
  });

  it('a long run with everything on stays JSON-safe', () => {
    const s = program(9);
    s.policies.no_crunch = true;
    for (let w = 0; w < 120; w++) {
      for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
      tick(s);
      s.cash = Math.max(s.cash, 1e6);
    }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    for (const p of s.staff) expect(Number.isFinite(p.strain)).toBe(true);
  });
});

describe('natural vacations', () => {
  it('everyone takes about two weeks a year, staggered, and a crunch or outage postpones it with strain', async () => {
    const { runBot } = await import('../../src/sim/bots.js');
    const { vacationSystem } = await import('../../src/sim/strain.js');
    const awayWeeks = {};
    let worst = 0;
    runBot('sensible', 3, 260, { onWeek: (st) => {
      const onVacation = st.staff.filter((p) => st.flags[`awayFor_${p.id}`] === 'Vacation');
      for (const p of onVacation) awayWeeks[p.id] = (awayWeeks[p.id] ?? 0) + 1;
      if (st.staff.length >= 8) worst = Math.max(worst, onVacation.length / st.staff.length);
    } });
    const counts = Object.values(awayWeeks);
    expect(counts.length).toBeGreaterThan(5);
    expect(worst).toBeLessThanOrEqual(B.vacationMaxShare + 0.1);
    const s = game(4);
    const p = addStaff(s, 'engineer', 'mid', { hiredWeek: -200, strain: 10 });
    const q = addProduct(s);
    s.outage = { productId: q.id, kind: 'ransomware', severity: 3, weeks: 1, unrecoverable: false };
    run(s, vacationSystem);
    expect(p.mood).not.toBe('away');
    expect(p.strain).toBe(10 + B.vacationPostponeStrain);
    s.outage = null;
    s.week = s.flags.vacationDue[p.id];
    run(s, vacationSystem);
    expect(p.mood).toBe('away');
  });
});
