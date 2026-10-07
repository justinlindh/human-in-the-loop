import { describe, expect, it } from 'vitest';
import { SPARK_WEEKS, sparkSig, sparkTone, sparkValues } from './cashSpark.js';

const hist = (n, f = (i) => i * 1000) => Array.from({ length: n }, (_, i) => ({ week: i + 1, cash: f(i) }));

describe('the HUD cash sparkline', () => {
  it('uses the last stretch of weekly cash, oldest first', () => {
    const v = sparkValues(hist(100));
    expect(v).toHaveLength(SPARK_WEEKS);
    expect(v[v.length - 1]).toBe(99000);
    expect(v[0]).toBe(60000);
    expect(sparkValues(hist(3))).toEqual([0, 1000, 2000]);
    expect(sparkValues(undefined)).toEqual([]);
  });

  it('reads rising, falling and the runway warnings from the line and the runway colour', () => {
    expect(sparkTone([1, 2, 3], 'sub')).toBe('up');
    expect(sparkTone([3, 2, 1], 'sub')).toBe('down');
    expect(sparkTone([3, 2, 1], 'sub warn')).toBe('warn');
    expect(sparkTone([1, 2, 3], 'sub bad')).toBe('bad');
    expect(sparkTone([5], 'sub')).toBe('flat');
  });

  it('redraws only when the history grows or the colour changes', () => {
    const a = hist(10);
    expect(sparkSig(a, 'up')).toBe(sparkSig([...a], 'up'));
    expect(sparkSig(a, 'up')).not.toBe(sparkSig(hist(11), 'up'));
    expect(sparkSig(a, 'up')).not.toBe(sparkSig(a, 'bad'));
  });
});
