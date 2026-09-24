import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { checkUnlocks } from '../../src/sim/unlocks.js';
import { outputMult } from '../../src/sim/staff.js';
import { strainDelta } from '../../src/sim/strain.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { classicGame, game, addStaff } from './helpers.js';

describe('Crunch Mode', () => {
  it('opens at the first launch', () => {
    const s = classicGame(2);
    checkUnlocks(makeCtx(s));
    expect(dispatch(s, { type: 'setPolicy', id: 'crunch', on: true }).ok).toBe(false);
    s.stats.launches = 1;
    for (let i = 0; i < 40 && s.unlocks['policy.crunch'] === undefined; i++) { s.week++; checkUnlocks(makeCtx(s)); }
    expect(dispatch(s, { type: 'setPolicy', id: 'crunch', on: true }).ok).toBe(true);
  });

  it('and No Crunch turn each other off', () => {
    const s = game(3);
    s.unlocks['policy.crunch'] = 0;
    s.unlocks['policy.no_crunch'] = 0;
    dispatch(s, { type: 'setPolicy', id: 'crunch', on: true });
    dispatch(s, { type: 'setPolicy', id: 'no_crunch', on: true });
    expect(s.policies).toMatchObject({ no_crunch: true });
    expect(s.policies.crunch).toBeUndefined();
    dispatch(s, { type: 'setPolicy', id: 'crunch', on: true });
    expect(s.policies.crunch).toBe(true);
    expect(s.policies.no_crunch).toBeUndefined();
  });

  it('builders ship more and everyone working gets more tired', () => {
    const s = game(4);
    const eng = addStaff(s, 'engineer', 'mid', { stamina: 90, assignment: { type: 'project', targetId: 'j1' } });
    const sup = addStaff(s, 'support', 'mid', { stamina: 90 });
    const out = outputMult(s, eng);
    const outSup = outputMult(s, sup);
    const strain = strainDelta(s, eng, 0);
    s.policies.crunch = true;
    expect(outputMult(s, eng)).toBeCloseTo(out * (1 + B.crunchOutput));
    expect(outputMult(s, sup)).toBeCloseTo(outSup);
    expect(strainDelta(s, eng, 0)).toBeCloseTo(strain + B.crunchStrain);
  });

  it('a crunch-built company burns people out; careful players do not', () => {
    const count = (bot, seed) => runBot(bot, seed, 780).resignations;
    const reckless = [1, 3, 4, 7].map((seed) => count('recklessHumans', seed));
    const careful = [1, 3].map((seed) => count('sensible', seed));
    expect(Math.max(...reckless)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...careful)).toBeLessThan(Math.max(...reckless));
  }, 180000);
});
