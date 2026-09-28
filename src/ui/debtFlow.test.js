import { describe, it, expect } from 'vitest';
import { debtTop, debtReadout, fmtRate } from './debtFlow.js';

const zero = { work: 0, automation: 0, products: 0, lowKnowledge: 0, seniors: 0, maintenance: 0, reviews: 0, oneOff: 0, net: 0 };

describe('tech debt readout', () => {
  it('formats rates with a sign and one decimal', () => {
    expect(fmtRate(1.24)).toBe('+1.2');
    expect(fmtRate(-0.9)).toBe('−0.9');
    expect(fmtRate(0.01)).toBe('0');
  });

  it('lists the biggest sources first and skips tiny ones', () => {
    const top = debtTop({ ...zero, work: 1.2, reviews: -0.9, products: 0.3, automation: 0.01, net: 0.6 });
    expect(top.map((x) => x.key)).toEqual(['work', 'reviews', 'products']);
  });

  it('reads a growing debt as sources', () => {
    const r = debtReadout({ comprehensionDebt: 24, debtFlow: { ...zero, work: 1.2, reviews: -0.9, net: 0.3 } });
    expect(r.sources).toBe('Shipping code +1.2/wk, Reviews −0.9/wk');
    expect(r.held).toBeNull();
    expect(r.net).toBeCloseTo(0.3);
  });

  it('says when the debt is capped at 100', () => {
    const r = debtReadout({ comprehensionDebt: 100, debtFlow: { ...zero, work: 1.2, seniors: -0.4, net: 0 } });
    expect(r.held).toBe('Maxed out at 100');
    expect(debtReadout({ comprehensionDebt: 0, debtFlow: { ...zero, work: 1.1, net: 1.1 } }).held).toBeNull();
  });

  it('is empty on a fresh game or an old save', () => {
    expect(debtReadout({ comprehensionDebt: 0, debtFlow: zero }).empty).toBe(true);
    expect(debtReadout({ comprehensionDebt: 0 }).empty).toBe(true);
  });
});
