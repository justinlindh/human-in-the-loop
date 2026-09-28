import { describe, it, expect, beforeAll } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

// A company-wide celebrate says what the company is celebrating; a person's celebrate doesn't.
describe('issue #826: a company party carries its cause', () => {
  const parties = [], personal = [];
  beforeAll(() => {
    for (const seed of [1, 2]) runBot('balanced', seed, 520, { onWeek: (s, ev) => {
      for (const e of ev) {
        if (e.type !== 'celebrate') continue;
        if (e.staffId === null) parties.push({ e, before: ev[ev.indexOf(e) - 1], names: s.products.map((p) => p.name) });
        else personal.push(e);
      }
    } });
  }, 120000);

  it('every company party has a short caption naming a real product', () => {
    expect(parties.length).toBeGreaterThan(0);
    for (const { e, names } of parties) {
      expect(typeof e.cause).toBe('string');
      expect(e.cause.length).toBeLessThanOrEqual(60);
      expect(names.some((n) => e.cause.includes(n)), e.cause).toBe(true);
    }
  });

  it('launch parties say the product launched; award parties name the award', () => {
    const launches = parties.filter(({ before }) => before?.type === 'launch');
    const awards = parties.filter(({ before }) => before?.type === 'award');
    expect(launches.length).toBeGreaterThan(0);
    for (const { e } of launches) expect(e.cause).toMatch(/ launched$/);
    for (const { e, before } of awards) expect(e.cause).toBe(before.text);
  });

  it("a person's celebration leaves cause out", () => {
    expect(personal.length).toBeGreaterThan(0);
    expect(personal.some((e) => 'cause' in e)).toBe(false);
  });
});
