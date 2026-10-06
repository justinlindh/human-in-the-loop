import { describe, expect, it } from 'vitest';
import { STOCK_NAMES, suggestCompany } from './companyNames.js';

describe('company name suggestions', () => {
  it('has a long, unique pool that fits the name box, with no "startup"', () => {
    expect(STOCK_NAMES.length).toBeGreaterThanOrEqual(45);
    expect(new Set(STOCK_NAMES).size).toBe(STOCK_NAMES.length);
    for (const n of STOCK_NAMES) { expect(n.length, n).toBeLessThanOrEqual(26); expect(n.toLowerCase()).not.toContain('startup'); }
  });

  it('an era roll can draw that era\'s names, and the general pool in any era', () => {
    const low = () => 0;
    expect(suggestCompany('dotcom', low)).toBe('Pivot Table Labs');
    const seen = new Set();
    // A small deterministic generator, so the gate and the pick both vary.
    let s = 12345;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    for (let i = 0; i < 400; i++) seen.add(suggestCompany('dotcom', rnd));
    expect(seen.has('Eyeball Express') || seen.has('Synergy.net')).toBe(true);
    expect([...seen].every((n) => !/^Blogster|Mashup/.test(n))).toBe(true);
  });

  it('keeps the built-up names for the rest of the rolls', () => {
    const seq = [0.9, 0, 0];
    expect(suggestCompany('classic', () => seq.shift())).toBe('Loopworks');
  });
});
