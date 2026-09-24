import { describe, it, expect } from 'vitest';
import { tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { applyEffects } from '../../src/sim/effects.js';
import { modifierBonus } from '../../src/sim/modifiers.js';
import { game } from './helpers.js';

describe('issue #73: effects last exactly their duration', () => {
  it('a 3-week modifier applies to 3 ticks, then is gone from the state with its toast in the last tick', () => {
    const s = game(2);
    s.cash = 1e7;
    s.pendingDecision = null;
    applyEffects(makeCtx(s), { modifier: { key: 'output', value: 0.2, weeks: 3, label: 'Test boost' } });
    let applied = 0;
    let endedAt = null;
    for (let i = 1; i <= 5; i++) {
      if (modifierBonus(s, 'output') >= 0.2) applied++;
      const ev = tick(s);
      s.pendingDecision = null;
      if (ev.some((e) => e.type === 'toast' && e.text === 'Test boost has ended.')) endedAt = i;
      if (i === 3) expect(s.modifiers.some((m) => m.label === 'Test boost')).toBe(false);
    }
    expect(applied).toBe(3);
    expect(endedAt).toBe(3);
  });
});
