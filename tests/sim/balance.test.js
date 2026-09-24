import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const runs = {};
const get = (name) => (runs[name] ??= SEEDS.map((seed) => runBot(name, seed)));
const share = (list, pred) => list.filter(pred).length / list.length;

describe('balance thresholds (40 seeds per bot)', () => {
  it('automate-everything loses in at least 70% of seeds', () => {
    expect(share(get('automateAll'), (r) => !r.won && r.reason !== 'timeout')).toBeGreaterThanOrEqual(0.7);
  }, 180000);

  it.skip('careful all-humans play wins at most 40% of seeds', () => {
    expect(share(get('allHumans'), (r) => r.won)).toBeLessThanOrEqual(0.4);
  }, 180000);

  it('automation is real leverage: balanced beats all-humans by at least 20 points', () => {
    expect(share(get('balanced'), (r) => r.won) - share(get('allHumans'), (r) => r.won)).toBeGreaterThanOrEqual(0.2);
  }, 180000);

  it.skip('balanced wins in 30% to 90% of seeds and sometimes reaches HQ', () => {
    const b = get('balanced');
    const wins = share(b, (r) => r.won);
    expect(wins).toBeGreaterThanOrEqual(0.3);
    expect(wins).toBeLessThanOrEqual(0.9);
    expect(b.some((r) => r.maxStage === 2)).toBe(true);
  }, 180000);

  it('a sensible player who hires one person early survives the opening', () => {
    const s = get('sensible');
    expect(share(s, (r) => r.weeks > 104 || r.won)).toBeGreaterThanOrEqual(0.9);
  }, 180000);
});
