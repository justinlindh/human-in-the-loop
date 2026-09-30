import { describe, it, expect, beforeEach } from 'vitest';
import { pnow, pAfter, pClear, pTick, pReset } from './pclock.js';

beforeEach(pReset);

describe('presentation clock', () => {
  it('fires only as frames advance it, in time order', () => {
    const seen = [];
    pAfter(300, () => seen.push('b'));
    pAfter(100, () => seen.push('a'));
    expect(seen).toEqual([]);
    pTick(99); expect(seen).toEqual([]);
    pTick(1); expect(seen).toEqual(['a']);
    pTick(500); expect(seen).toEqual(['a', 'b']);
    expect(pnow()).toBe(600);
  });
  it('times a timer scheduled by a firing timer from the current frame time', () => {
    const seen = [];
    pAfter(10, () => { seen.push(1); pAfter(5, () => seen.push(2)); });
    pTick(100);
    expect(seen).toEqual([1]);
    pTick(5);
    expect(seen).toEqual([1, 2]);
  });
  it('clears a pending timer', () => {
    const seen = [];
    const h = pAfter(10, () => seen.push(1));
    pClear(h); pTick(50);
    expect(seen).toEqual([]);
  });
});
