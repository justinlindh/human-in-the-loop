import { describe, it, expect } from 'vitest';
import { createRng, next, range, int, pick, chance, weighted, shuffle } from '../../src/sim/rng.js';

const seq = (r, n = 10) => Array.from({ length: n }, () => next(r));

describe('rng', () => {
  it('is deterministic per seed', () => {
    expect(seq(createRng(42))).toEqual(seq(createRng(42)));
  });

  it('differs across seeds', () => {
    expect(seq(createRng(1))).not.toEqual(seq(createRng(2)));
  });

  it('returns values in [0, 1)', () => {
    const r = createRng(9);
    for (const v of seq(r, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('resumes identically after a JSON round trip', () => {
    const r = createRng(7);
    seq(r, 5);
    const copy = JSON.parse(JSON.stringify(r));
    expect(seq(copy)).toEqual(seq(r));
  });

  it('int is inclusive on both ends', () => {
    const r = createRng(3);
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(int(r, 1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('range stays within bounds', () => {
    const r = createRng(4);
    for (let i = 0; i < 200; i++) {
      const v = range(r, -2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
    }
  });

  it('pick returns an element and chance respects extremes', () => {
    const r = createRng(5);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(r, arr));
    for (let i = 0; i < 50; i++) {
      expect(chance(r, 0)).toBe(false);
      expect(chance(r, 1)).toBe(true);
    }
  });

  it('shuffle returns a permutation and leaves the input untouched', () => {
    const r = createRng(6);
    const arr = [1, 2, 3, 4, 5, 6];
    const out = shuffle(r, arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(arr);
    expect(out).not.toBe(arr);
  });

  it('weighted never returns a zero-weight item when a positive one exists', () => {
    const r = createRng(8);
    const items = [{ id: 'a', w: 0 }, { id: 'b', w: 2 }, { id: 'c', w: 0 }, { id: 'd', w: 1 }];
    for (let i = 0; i < 500; i++) {
      const got = weighted(r, items, (x) => x.w);
      expect(['b', 'd']).toContain(got.id);
    }
  });

  it('weighted returns null for an empty list', () => {
    expect(weighted(createRng(1), [], () => 1)).toBe(null);
  });
});
