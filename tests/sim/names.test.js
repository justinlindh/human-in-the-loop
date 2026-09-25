import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import {
  FIRST_NAMES, LAST_NAMES, INTL_FIRST_NAMES, INTL_LAST_NAMES, US_FIRST_NAMES, US_LAST_NAMES, SOUTH_ASIAN_FIRST_NAMES, SOUTH_ASIAN_LAST_NAMES, FAMOUS_NAMES,
} from '../../src/data/names.js';
import { generateStaff } from '../../src/sim/staff.js';
import { game } from './helpers.js';

describe('name variety', () => {
  it('the pools are wide and have no duplicates', () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
  });

  it('the tiers split the pools cleanly, and draws look like a typical US tech company', () => {
    expect(new Set([...US_FIRST_NAMES, ...SOUTH_ASIAN_FIRST_NAMES, ...INTL_FIRST_NAMES]).size).toBe(FIRST_NAMES.length);
    expect(new Set([...US_LAST_NAMES, ...SOUTH_ASIAN_LAST_NAMES, ...INTL_LAST_NAMES]).size).toBe(LAST_NAMES.length);
    const tierOf = (name, sa, intl) => (sa.includes(name) ? 'sa' : intl.includes(name) ? 'intl' : 'us');
    const count = { first: { us: 0, sa: 0, intl: 0 }, last: { us: 0, sa: 0, intl: 0 } };
    let matched = 0;
    const N = 6000;
    for (let seed = 1; seed <= N / 20; seed++) {
      const s = game(seed);
      for (let i = 0; i < 20; i++) {
        const [f, l] = generateStaff(s, { role: 'engineer', seniority: 'mid' }).name.split(' ');
        const tf = tierOf(f, SOUTH_ASIAN_FIRST_NAMES, INTL_FIRST_NAMES);
        const tl = tierOf(l, SOUTH_ASIAN_LAST_NAMES, INTL_LAST_NAMES);
        count.first[tf]++;
        count.last[tl]++;
        matched += tf === tl;
      }
    }
    for (const c of Object.values(count)) {
      // International names are a clear minority: a quarter to a third.
      expect(c.intl / N).toBeGreaterThan(0.23);
      expect(c.intl / N).toBeLessThan(0.33);
      // Within the US mix, about one name in five to six is South Asian.
      expect(c.sa / (c.us + c.sa)).toBeGreaterThan(1 / 7);
      expect(c.sa / (c.us + c.sa)).toBeLessThan(1 / 4.5);
    }
    // Most people's first and last names come from the same tier.
    expect(matched / N).toBeGreaterThan(0.75);
  });

  it('never produces a famous person\'s full name', () => {
    const [first, last] = [...FAMOUS_NAMES][0].split(' ');
    for (const n of FAMOUS_NAMES) {
      const [f, l] = n.split(' ');
      expect(FIRST_NAMES, n).toContain(f);
      expect(LAST_NAMES, n).toContain(l);
    }
    let seen = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const s = game(seed);
      for (let i = 0; i < 30; i++) {
        const name = generateStaff(s, { role: 'engineer', seniority: 'mid' }).name;
        expect(FAMOUS_NAMES.has(name), name).toBe(false);
        if (name.startsWith(`${first} `)) seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(last).toBeTruthy();
  });

  it('a long run never has two people with the same full name, and first names rarely repeat', () => {
    for (const [bot, seed] of [['balanced', 1], ['sensible', 2], ['recklessHumans', 3]]) {
      let worstRepeats = 0;
      runBot(bot, seed, 780, { onWeek: (s) => {
        const people = [...s.staff, ...s.candidates];
        const fulls = people.map((p) => p.name);
        expect(new Set(fulls).size, `${bot}/${seed} week ${s.week}`).toBe(fulls.length);
        const firsts = people.map((p) => p.name.split(' ')[0]);
        worstRepeats = Math.max(worstRepeats, firsts.length - new Set(firsts).size);
      } });
      expect(worstRepeats, `${bot}/${seed}`).toBe(0);
    }
  }, 120000);
});
