import { describe, it, expect } from 'vitest';
import { BOTS } from '../../src/sim/bots.js';
import { fullRun, leaks } from './_runs.js';

// Tests that read whole bot runs. Each (bot, seed) is played once (tests/sim/_runs.js) and shared.

describe('invariants hold for every bot over full runs', () => {
  for (const name of Object.keys(BOTS)) {
    it(`${name}: finite state, staff within capacity, bounded history`, () => {
      for (const seed of [1, 2, 3, 4, 5]) expect(fullRun(name, seed).violations).toEqual([]);
    }, 120000);
  }
});

describe('issue #10: no AI talk before the ChatGBT moment', () => {
  it('every bot, several seeds: nothing a player can read in Classic mentions AI', () => {
    const hits = [];
    let scanned = 0;
    for (const name of Object.keys(BOTS)) {
      for (const seed of [1, 2, 3, 4]) {
        for (const [where, text, week] of fullRun(name, seed).classic) {
          scanned++;
          if (leaks(text)) hits.push(`${name}/${seed} week ${week} ${where}: ${text}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(50000);
    expect(hits.slice(0, 20)).toEqual([]);
  }, 300000);
});

describe('beats in real runs', () => {
  it('the agent bill and the first deals land between the eras they fill', () => {
    const weeks = { agent_bill: [], rival_megaround: [], floor_next_door: [], deals_open: [] };
    for (const seed of [1, 2, 3, 4]) {
      const at = fullRun('balanced', seed).at[800];
      for (const [id, w] of Object.entries(at.beats)) (weeks[id] ??= []).push(w - at.agents);
    }
    expect(weeks.agent_bill.length).toBe(4);
    expect(weeks.deals_open.length).toBeGreaterThanOrEqual(3);
  }, 180000);
});

describe('natural attrition', () => {
  it('a balanced company loses someone every year or two, not zero and not a flood', () => {
    const rates = [];
    for (const seed of [1, 2, 3, 4]) {
      const weekly = fullRun('balanced', seed).resignsByWeek.slice(0, 780);
      rates.push(weekly.reduce((a, b) => a + b, 0) / (weekly.length / 52));
    }
    const mean = rates.reduce((a, b) => a + b) / rates.length;
    expect(mean).toBeGreaterThanOrEqual(0.25);
    expect(mean).toBeLessThanOrEqual(1.2);
  }, 120000);
});

describe('Crunch Mode', () => {
  it('a crunch-built company burns people out; careful players do not', () => {
    const count = (bot, seed) => fullRun(bot, seed).at[780].resignations;
    const reckless = [1, 3, 4, 7].map((seed) => count('recklessHumans', seed));
    const careful = [1, 3].map((seed) => count('sensible', seed));
    expect(Math.max(...reckless)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...careful)).toBeLessThan(Math.max(...reckless));
  }, 180000);
});
