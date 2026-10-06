import { describe, it, expect } from 'vitest';
import { sensibleValue } from '../../src/sim/bots.js';
import { EVENTS } from '../../src/data/events.js';
import { game } from './helpers.js';

const mod = (key, value) => ({ modifier: { key, value, weeks: 12, label: 'test' } });

describe('the careful bots value a modifier by its direction', () => {
  it('a loss of a good thing scores below nothing, and a gain above it', () => {
    const s = game(1);
    for (const key of ['output', 'meaningRecovery', 'acquisition', 'hype']) {
      expect(sensibleValue(s, mod(key, -0.1)), key).toBeLessThan(0);
      expect(sensibleValue(s, mod(key, 0.1)), key).toBeGreaterThan(0);
    }
  });

  it('a rise in a bad thing scores below nothing, and a fall above it', () => {
    const s = game(1);
    expect(sensibleValue(s, mod('churn', 0.1))).toBeLessThan(0);
    expect(sensibleValue(s, mod('churn', -0.1))).toBeGreaterThan(0);
  });

  it('cost cutting no longer counts its slower output and recovery as gains', () => {
    const s = game(1);
    const fx = EVENTS.bridge_loan.choices.find((c) => c.label === 'Cut costs').effects;
    expect(sensibleValue(s, fx)).toBeLessThan(sensibleValue(s, { cash: fx.cash }));
  });
});
