import { describe, it, expect } from 'vitest';
import { nocLockWeeks, nocStatus, nocEffect, nocPlaced } from './nocMode.js';
import { B } from './content.js';

const st = (ops, week = 100) => ({ week, ops, office: { placed: [{ itemId: 'noc', level: 2 }] } });

describe('NOC mode card', () => {
  it('finds the placed NOC', () => {
    expect(nocPlaced(st({}))?.level).toBe(2);
    expect(nocPlaced({ office: { placed: [] } })).toBe(null);
    expect(nocPlaced({})).toBe(null);
  });
  it('says nothing is chosen before the bet', () => {
    expect(nocLockWeeks(st({ noc: null }))).toBe(0);
    expect(nocStatus(st({ noc: null }))).toMatch(/Not chosen yet/);
  });
  it('counts the lock down and opens it', () => {
    const since = 100 - (B.nocSwitchWeeks - 3);
    expect(nocLockWeeks(st({ noc: 'agents', nocSince: since }))).toBe(3);
    expect(nocStatus(st({ noc: 'agents', nocSince: since }))).toMatch(/Agents are watching\. You can switch again in 3 weeks/);
    expect(nocLockWeeks(st({ noc: 'humans', nocSince: 100 - B.nocSwitchWeeks }))).toBe(0);
    expect(nocStatus(st({ noc: 'humans', nocSince: 1 }))).toMatch(/switch any time/);
  });
  it('states the mode effect', () => {
    expect(nocEffect(st({ noc: 'agents' }), 0)).toMatch(/misread/);
    expect(nocEffect(st({ noc: 'humans' }), 1)).toBe(`Crew on security: 1 of ${B.nocCrew} for full catch.`);
  });
});
