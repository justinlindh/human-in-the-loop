import { describe, it, expect } from 'vitest';
import { mentions, planReplay } from '../../blender/checks/sweep-plan.js';

describe('sweep scoping', () => {
  it('matches an item id as a whole token', () => {
    expect(mentions('noc', 'noc/pal_plastic_charcoal', 'desk/pal_wood')).toBe(true);
    expect(mentions('noc', 'person', 'noc_l2#4[frame]')).toBe(true);
    expect(mentions('noc', 'a', 'b', 'noc L3 reaches 0.05 m past its footprint')).toBe(true);
    expect(mentions('noc', 'snocone/x', 'desk/y')).toBe(false);
    expect(mentions('noc', 'bookshelf', 'person/walking_head', null)).toBe(false);
  });
});

describe('planReplay', () => {
  const report = {
    windows: [{ state: 'event:printer_jam:s3balancedw40', query: 'printer_jam --choice 0' }],
    violations: [
      { key: 'a', state: 'seed:1:w263', states: ['seed:1:w263', 'seed:1:w300', 'seed:2:w12'] },
      { key: 'b', state: 'mock:floor', states: ['mock:floor', 'moment:pet:dog'] },
      { key: 'c', state: 'event:printer_jam:s3balancedw40', states: ['event:printer_jam:s3balancedw40'] },
      { key: 'd', state: 'weird', states: ['weird'] },
    ],
  };
  it('collects weeks per seed, mocks, indexed moments and what it cannot re-check', () => {
    const p = planReplay(report);
    expect(p.seeds).toEqual({ 1: [263, 300], 2: [12] });
    expect(p.mocks).toEqual(['floor']);
    expect(p.events).toEqual(['printer_jam --choice 0']);
    expect(p.skipped).toEqual(['weird']);
  });
  it('narrows to the named states', () => {
    const p = planReplay(report, ['seed:1:w300', 'mock:floor']);
    expect(p.seeds).toEqual({ 1: [300] });
    expect(p.mocks).toEqual(['floor']);
    expect(p.events).toEqual([]);
    expect(planReplay(report, ['seed:9:w1']).seeds).toEqual({});
  });
});
