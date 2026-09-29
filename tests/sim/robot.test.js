import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { ITEMS } from '../../src/data/items.js';
import { EVENTS } from '../../src/data/events.js';
import { TRAITS } from '../../src/data/traits.js';
import { ROBOT_LINES } from '../../src/data/robot.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { itemBonus } from '../../src/sim/bonus.js';
import { purchaseProblem } from '../../src/sim/office.js';
import { generateStaff } from '../../src/sim/staff.js';
import { robotSystem, robotResentment, robotRefusal, automationShare, calmRobot } from '../../src/sim/robot.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { FUNCTIONS } from '../../src/sim/state.js';
import { game, classicGame, addStaff, placeAction, withItem } from './helpers.js';

const R = B.robot;
const withRobotB = (over, fn) => {
  const old = { ...R };
  Object.assign(R, over);
  try { return fn(); } finally { Object.assign(R, old); }
};
const automate = (s, level) => { for (const fn of FUNCTIONS) s.automation[fn].level = level; };
const week = (s) => { const ctx = makeCtx(s); robotSystem(ctx); s.week++; return ctx.events; };
const robotOf = (s) => s.office.placed.find((p) => p.itemId === 'office_robot');

// An Agents-era company with a few people and an office robot on its dock.
function company(seed = 4, level = 1) {
  const s = game(seed);
  s.cash = 1e7;
  for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid');
  addStaff(s, 'support', 'mid');
  expect(dispatch(s, placeAction(s, 'office_robot')).ok).toBe(true);
  robotOf(s).level = level;
  automate(s, 0);
  return s;
}

describe('office robot item (#178)', () => {
  it('is one unique Agents-era shop item with three levels', () => {
    expect(ITEMS.office_robot).toMatchObject({ kind: 'shop', unique: true, era: 'agents', costs: [15000, 45000, 120000], footprint: { w: 1, h: 1 } });
    const s = classicGame(1);
    s.cash = 1e7;
    s.unlocks.office = 0;
    expect(purchaseProblem(s, 'office_robot')).toBeTruthy();
    const t = company();
    expect(purchaseProblem(t, 'office_robot')).toBe('You already have one');
  });

  it('state.robot appears when it is placed and goes when it is sold', () => {
    const s = game(4);
    s.cash = 1e7;
    expect(s.robot).toBe(null);
    dispatch(s, placeAction(s, 'office_robot'));
    expect(s.robot).toEqual({ status: 'ok', cause: null, since: null, breakdowns: 0, sabotages: 0, calmUntil: null, googly: false });
    dispatch(s, { type: 'sellItem', id: robotOf(s).id });
    expect(s.robot).toBe(null);
  });

  it('lifts stamina and meaning recovery, pays nothing while broken, and waters the plants from level 2', () => {
    const s = company(4, 1);
    const on = itemBonus(s, 'staminaRecovery');
    expect(on).toBeGreaterThanOrEqual(ITEMS.office_robot.effects[0].staminaRecovery);
    s.robot.status = 'broken';
    expect(itemBonus(s, 'staminaRecovery')).toBeCloseTo(on - ITEMS.office_robot.effects[0].staminaRecovery);
    s.robot.status = 'ok';
    const desk = s.office.placed.find((d) => s.staff.some((p) => p.deskId === d.id));
    s.office.placed.push({ id: 'plantx', itemId: 'plant', level: 1, x: desk.x, y: desk.y + 2, rot: 0 });
    const l1 = itemBonus(s, 'meaningRecovery') - ITEMS.office_robot.effects[0].meaningRecovery;
    robotOf(s).level = 2;
    const l2 = itemBonus(s, 'meaningRecovery') - ITEMS.office_robot.effects[1].meaningRecovery;
    expect(l1).toBeGreaterThan(0);
    expect(l2).toBeCloseTo(l1 * R.plantBoost);
  });
});

describe('office robot breakdowns', () => {
  it('breaks without pausing, and the next week someone slaps it back', () => withRobotB({ breakChance: 1 }, () => {
    const s = company();
    const ev = week(s);
    const br = ev.find((e) => e.type === 'robot');
    expect(br).toMatchObject({ kind: 'breakdown', staffId: null });
    expect(['spin', 'stuck', 'emptyDesk']).toContain(br.cause);
    expect(s.robot).toMatchObject({ status: 'broken', cause: br.cause, since: s.week - 1, breakdowns: 1, sabotages: 0 });
    expect(s.pendingDecision).toBe(null);
    expect(ev.some((e) => e.type === 'chat' && e.channel === 'random')).toBe(true);
    const fix = week(s).find((e) => e.type === 'robot');
    expect(fix).toMatchObject({ kind: 'fixed', sameWeek: false });
    expect(s.staff.find((p) => p.id === fix.fixerId).role).toBe('engineer');
    expect(s.robot).toMatchObject({ status: 'ok', cause: null, since: null });
  }));

  it('brings coffee to the desk of someone who is away, never to nobody', () => withRobotB({ breakChance: 1 }, () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const s = company(seed);
      const away = s.staff.find((p) => p.deskId && !p.founder);
      away.mood = 'away';
      const br = week(s).find((e) => e.kind === 'breakdown');
      seen.add(br.cause);
      if (br.cause === 'emptyDesk') expect(br.deskStaffId).toBe(away.id);
      else expect(br.deskStaffId).toBe(null);
    }
    expect([...seen].sort()).toEqual(['emptyDesk', 'spin', 'stuck']);
    const s = company(3);
    for (let i = 0; i < 30; i++) { s.robot.status = 'ok'; expect(week(s).find((e) => e.kind === 'breakdown').cause).not.toBe('emptyDesk'); }
  }));

  it('two slaps earn Percussive Maintenance, and then it is fixed the same week', () => withRobotB({ breakChance: 1 }, () => {
    const s = company();
    for (const p of s.staff) if (p.role === 'engineer') p.traits = [];
    const fixers = [];
    let earned = null;
    for (let i = 0; i < 40 && !earned; i++) {
      for (const e of week(s)) {
        if (e.kind === 'fixed') fixers.push(e.fixerId);
        if (e.type === 'traitEarned') earned = e;
      }
    }
    expect(earned).toMatchObject({ traitId: 'percussive', source: 'record' });
    expect(fixers.filter((id) => id === earned.staffId)).toHaveLength(R.fixesForTrait);
    const ev = week(s);
    expect(ev.find((e) => e.kind === 'breakdown')).toBeTruthy();
    expect(ev.find((e) => e.kind === 'fixed')).toMatchObject({ fixerId: earned.staffId, sameWeek: true });
    expect(s.robot.status).toBe('ok');
    expect(TRAITS.percussive.mods).toEqual({ reliability: 1.05 });
  }));

  it('a same-week fix lifts the fixer by fixMeaning', () => withRobotB({ breakChance: 1, fixMeaning: 7 }, () => {
    const s = company();
    for (const p of s.staff) if (p.role === 'engineer') p.traits = [];
    const fixer = s.staff.find((p) => p.role === 'engineer');
    fixer.traits = ['percussive'];
    fixer.meaning = 50;
    const fix = week(s).find((e) => e.kind === 'fixed');
    expect(fix).toMatchObject({ fixerId: fixer.id, sameWeek: true });
    expect(fixer.meaning).toBe(57);
  }));

  it('nobody is ever hired with Percussive Maintenance', () => {
    const s = game(9);
    for (let i = 0; i < 400; i++) expect(generateStaff(s, { role: 'engineer', seniority: 'mid' }).traits).not.toContain('percussive');
  });

  it('level 3 breaks less often', () => {
    const count = (level) => {
      const s = company(6, level);
      let n = 0;
      for (let i = 0; i < 2000; i++) { s.robot.status = 'ok'; if (week(s).some((e) => e.kind === 'breakdown')) n++; }
      return n;
    };
    const [l1, l3] = [count(1), count(3)];
    expect(l1 / 2000).toBeGreaterThan(R.breakChance * 0.6);
    expect(l1 / 2000).toBeLessThan(R.breakChance * 1.6);
    expect(l3).toBeLessThan(l1);
  });
});

describe('office robot resentment', () => {
  it('follows the automation share: fond, then grumbling, then sabotage', () => {
    const s = company();
    expect(robotResentment(s)).toBe('fond');
    automate(s, R.grumbleFrom);
    expect(automationShare(s)).toBeCloseTo(R.grumbleFrom);
    expect(robotResentment(s)).toBe('grumble');
    automate(s, R.sabotageFrom);
    expect(robotResentment(s)).toBe('sabotage');
  });

  it('once people grumble, only those whose own job is mostly automated refuse its coffee', () => {
    const s = company();
    const eng = s.staff.find((p) => p.role === 'engineer' && !p.founder);
    const sup = s.staff.find((p) => p.role === 'support');
    s.automation.support.level = 1;
    expect(robotRefusal(s, sup)).toBe(0);
    s.automation.engineering.level = 0.8;
    s.automation.qa.level = 0.5;
    expect(robotResentment(s)).toBe('grumble');
    expect(robotRefusal(s, sup)).toBe(ITEMS.office_robot.effects[0].meaningRecovery);
    expect(robotRefusal(s, eng)).toBe(ITEMS.office_robot.effects[0].meaningRecovery);
    const designer = addStaff(s, 'designer', 'mid');
    expect(robotRefusal(s, designer)).toBe(0);
    s.robot.status = 'broken';
    expect(robotRefusal(s, sup)).toBe(0);
  });

  it('sabotage only at a high share, never while calm, from the most automated person; the first one asks who kicked it', () => withRobotB({ breakChance: 0, sabotageChance: 1 }, () => {
    const s = company();
    automate(s, R.sabotageFrom);
    for (let i = 0; i < 20; i++) expect(week(s).some((e) => e.kind === 'breakdown')).toBe(false);
    automate(s, 1);
    calmRobot(s);
    for (let i = 0; i < R.calmWeeks; i++) expect(week(s).some((e) => e.kind === 'breakdown')).toBe(false);
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
    const ev = week(s);
    const br = ev.find((e) => e.kind === 'breakdown');
    expect(['cone', 'decaf', 'unplug']).toContain(br.cause);
    const saboteur = s.staff.find((p) => p.id === br.staffId);
    expect(saboteur.founder).toBe(false);
    expect(s.robot).toMatchObject({ breakdowns: 1, sabotages: 1 });
    expect(s.pendingDecision?.eventId).toBe('robot_kicked');
    for (const e of ev.filter((x) => x.type === 'chat')) expect(e.text).not.toContain(saboteur.name.split(' ')[0]);
  }));

  it('robot_kicked: a blameless meeting calms it, googly eyes halve sabotage for good', () => {
    const labels = EVENTS.robot_kicked.choices.map((c) => c.label);
    expect(labels).toEqual(['Hold a blameless meeting', 'Stick googly eyes on it', 'Let it go']);
    const pickChoice = (label) => {
      const s = company();
      s.pendingDecision = null; delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek;
      s.flags.robotKickDue = true;
      week(s);
      s.week--;
      expect(s.pendingDecision.eventId).toBe('robot_kicked');
      expect(dispatch(s, { type: 'resolveDecision', choice: labels.indexOf(label) }).ok).toBe(true);
      return s;
    };
    expect(pickChoice('Hold a blameless meeting').robot.calmUntil).toBeGreaterThanOrEqual(R.calmWeeks);
    expect(pickChoice('Stick googly eyes on it').robot.googly).toBe(true);
    expect(pickChoice('Let it go').robot).toMatchObject({ googly: false, calmUntil: null });
    const once = pickChoice('Let it go');
    once.flags.robotKickDue ??= false;
    expect(once.flags.robotKickDue).toBe(false);
  });

  it('googly eyes halve the sabotage chance', () => withRobotB({ breakChance: 0, sabotageChance: 0.5 }, () => {
    const count = (googly) => {
      const s = company(8);
      automate(s, 1);
      s.robot.googly = googly;
      let n = 0;
      for (let i = 0; i < 1500; i++) { s.robot.status = 'ok'; s.pendingDecision = null; if (week(s).some((e) => e.kind === 'breakdown')) n++; }
      return n / 1500;
    };
    const [plain, eyes] = [count(false), count(true)];
    expect(plain).toBeGreaterThan(0.4);
    expect(eyes).toBeGreaterThan(plain * R.googlyMult * 0.75);
    expect(eyes).toBeLessThan(plain * R.googlyMult * 1.25);
  }));

  it('the Waffle Party and music night calm it', async () => {
    const { stageIncentive } = await import('../../src/sim/incentives.js');
    const { tick } = await import('../../src/sim/index.js');
    const s = company();
    stageIncentive(s, 'waffle_party');
    tick(s);
    expect(s.robot.calmUntil).toBeGreaterThanOrEqual(s.week - 1 + R.calmWeeks);
  });
});

describe('office robot: nothing changes without one', () => {
  it('a company without a robot draws nothing and writes nothing', () => {
    const s = game(4);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    automate(s, 1);
    const before = JSON.stringify(s);
    const ctx = makeCtx(s);
    robotSystem(ctx);
    expect(ctx.events).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('robot state survives a save and loads as null in an old save', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const s = company();
    s.robot.googly = true;
    saveGame(s, storage);
    expect(loadGame(storage).state.robot).toMatchObject({ googly: true, status: 'ok' });
    const old = company();
    delete old.robot;
    saveGame(old, storage);
    expect(loadGame(storage).state.robot).toBe(null);
  });

  it('every line fills in and stays short', () => {
    const all = [...ROBOT_LINES.grumble, ...ROBOT_LINES.fond, ...Object.values(ROBOT_LINES.breakdown).flat(), ...ROBOT_LINES.fixed, ...ROBOT_LINES.fixedFast];
    for (const t of all) {
      expect(t.length, t).toBeLessThanOrEqual(90);
      expect(t, t).not.toMatch(/\{(?!name\}|fixer\}|coworker\})/);
      expect(t, t).not.toMatch(/startup/i);
    }
  });
});
