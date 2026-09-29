import { describe, expect, it } from 'vitest';
import { draw, fixed, reseed, shuffled } from './rand.js';

const take = (n, ...key) => Array.from({ length: n }, () => draw(...key));

describe('render rand', () => {
  it('replays the same draws for the same seed and week', () => {
    reseed(7, 100);
    const a = take(5, 'post');
    reseed(7, 99);
    reseed(7, 100);
    expect(take(5, 'post')).toEqual(a);
  });

  it("keeps each stream's draws whatever other streams drew first", () => {
    reseed(7, 100);
    const alone = take(3, 'mood', 's1');
    reseed(7, 101);
    reseed(7, 100);
    take(9, 'mood', 's2');
    Math.random();
    expect(take(3, 'mood', 's1')).toEqual(alone);
  });

  it('differs between weeks and between seeds', () => {
    reseed(7, 100);
    const a = take(4, 'post');
    reseed(7, 101);
    expect(take(4, 'post')).not.toEqual(a);
    reseed(8, 100);
    expect(take(4, 'post')).not.toEqual(a);
  });

  it('stays in [0, 1) and spreads', () => {
    reseed(1, 1);
    const xs = take(2000, 'spread');
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('fixed() gives one value per key for the week', () => {
    reseed(3, 5);
    const v = fixed('nodesk-x', 's9');
    draw('nodesk-x', 's9');
    expect(fixed('nodesk-x', 's9')).toBe(v);
  });

  it('shuffles a copy, keeping every item', () => {
    reseed(2, 2);
    const list = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffled(list, 'crowd');
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
