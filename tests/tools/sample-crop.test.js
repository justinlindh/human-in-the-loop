import { describe, it, expect } from 'vitest';
import { createCollector } from '../../blender/checks/sample.js';
import { isWorse } from '../../blender/checks/sweep-plan.js';

const at = { x: 1, y: 2, z: 3 };
const collect = (known, worst) => {
  const C = createCollector({ state: 's', known, worst, crops: 10, tol: {}, cropAt: () => 'crop' });
  return (value, check = 'person') => { C.add({}, check, 0, 'a', 'b', value, at); return C.list.find((v) => v.key === `${check}|a|b`); };
};

describe('sweep crops', () => {
  it('crops a new key', () => {
    expect(collect([], {})(0.1).crop).toBe('crop');
  });

  it('leaves an accepted key within its accepted depth uncropped', () => {
    expect(collect(['person|a|b'], { 'person|a|b': 0.2 })(0.21).crop).toBeNull();
  });

  it('crops an accepted key pushed past its accepted depth', () => {
    expect(collect(['person|a|b'], { 'person|a|b': 0.173 })(0.253).crop).toBe('crop');
  });

  it('agrees with the sweep on what counts as worse', () => {
    expect(isWorse(0.253, 0.173)).toBe(true);
    expect(isWorse(0.2, 0.173)).toBe(false);
    expect(isWorse(1, undefined)).toBe(false);
  });
});
