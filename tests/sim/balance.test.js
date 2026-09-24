import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { ARCHETYPES, foundingWarning } from '../../src/data/founders.js';

// Every run is 20 years (B.runWeeks) from January 2019 unless it ends sooner.
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const runs = {};
const get = (name) => (runs[name] ??= SEEDS.map((seed) => runBot(name, seed)));
const share = (list, pred) => list.filter(pred).length / list.length;

describe('balance thresholds (40 seeds per bot, 20 years each)', () => {
  it('runs last 20 years', () => {
    expect(B.runWeeks).toBe(1040);
  });

  it('automate-everything collapses in at least 70% of seeds, after the agents arrive', () => {
    const a = get('automateAll');
    expect(share(a, (r) => r.lostAfterAgents)).toBeGreaterThanOrEqual(0.7);
    expect(a.every((r) => r.eras.agents)).toBe(true);
  }, 300000);

  it('careful all-humans play reaches an exit in at most 40% of seeds', () => {
    expect(share(get('allHumans'), (r) => r.won)).toBeLessThanOrEqual(0.4);
  }, 300000);

  it('balanced exits in 30% to 90% of seeds, beats all-humans by 20 points, and reaches HQ', () => {
    const b = get('balanced');
    const wins = share(b, (r) => r.won);
    expect(wins).toBeGreaterThanOrEqual(0.3);
    expect(wins).toBeLessThanOrEqual(0.9);
    expect(wins - share(get('allHumans'), (r) => r.won)).toBeGreaterThanOrEqual(0.2);
    expect(b.some((r) => r.maxStage === 2)).toBe(true);
  }, 300000);

  it('a sensible player who hires one early survives the opening', () => {
    expect(share(get('sensible'), (r) => r.weeks > 104 || r.won)).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('a sensible player who hires two early also survives the opening', () => {
    const two = SEEDS.slice(0, 20).map((seed) => runBot('sensible', seed, 110, { setup: (s) => { s.flags.botEarlyHires = 2; } }));
    expect(two.every((r) => r.state.stats.hires >= 2)).toBe(true);
    expect(share(two, (r) => r.weeks > 104)).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('every founder pair survives the opening for a sensible player; only builder-less pairs get a warning', () => {
    const ids = Object.keys(ARCHETYPES);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const founders = [ids[i], ids[j]];
        const r = [1, 2, 3].map((seed) => runBot('sensible', seed, 110, { founding: { founders } }));
        expect(r.every((x) => x.weeks > 104), founders.join('+')).toBe(true);
        expect(r.every((x) => x.firstLaunch !== null && x.firstLaunch <= 26), founders.join('+')).toBe(true);
        expect(foundingWarning(founders) !== null, founders.join('+')).toBe(founders.every((id) => !ARCHETYPES[id].builder));
      }
    }
  }, 300000);

  it('reckless humans never exit, but always get a product out first', () => {
    const r = get('recklessHumans');
    expect(r.some((x) => x.won)).toBe(false);
    expect(r.every((x) => x.firstLaunch !== null)).toBe(true);
  }, 300000);
});
