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

  it('crops an accepted key with cropAll, never at a new key\'s expense', () => {
    const known = ['person|a0|z', 'person|a1|z', 'person|a2|z'];
    const C = createCollector({ state: 's', known, worst: {}, crops: 2, cropAll: true, tol: {}, cropAt: () => 'crop' });
    for (const a of ['a0', 'a1', 'a2']) C.add({}, 'person', 0, a, 'z', 0.1, at);
    for (const a of ['n0', 'n1', 'n2']) C.add({}, 'person', 0, a, 'z', 0.1, at);
    const cropped = (a) => C.list.find((v) => v.a === a).crop !== null;
    expect(['a0', 'a1', 'a2'].map(cropped)).toEqual([true, true, false]);
    expect(['n0', 'n1', 'n2'].map(cropped)).toEqual([true, true, false]);
  });

  it('leaves accepted keys uncropped without cropAll', () => {
    const C = createCollector({ state: 's', known: ['person|a|b'], worst: {}, crops: 5, tol: {}, cropAt: () => 'crop' });
    C.add({}, 'person', 0, 'a', 'b', 0.1, at);
    expect(C.list[0].crop).toBeNull();
  });

  it('agrees with the sweep on what counts as worse', () => {
    expect(isWorse(0.253, 0.173)).toBe(true);
    expect(isWorse(0.2, 0.173)).toBe(false);
    expect(isWorse(1, undefined)).toBe(false);
  });
});
