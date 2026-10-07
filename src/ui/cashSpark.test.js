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

  it('reads where cash is heading now, so a recovery is green however far it fell first', () => {
    // 110K down to 40K over 30 weeks, then back up 4K a week for 10: still below where it began.
    const dip = [...Array.from({ length: 30 }, (_, i) => 110000 - i * 2400), ...Array.from({ length: 10 }, (_, i) => 40400 + (i + 1) * 4000)];
    expect(dip[dip.length - 1]).toBeLessThan(dip[0]);
    expect(sparkTone(dip, 'sub')).toBe('up');
    // And the other way: climbing for a long time, then falling for the last stretch.
    const peak = [...Array.from({ length: 30 }, (_, i) => 10000 + i * 3000), ...Array.from({ length: 8 }, (_, i) => 97000 - (i + 1) * 2500)];
    expect(peak[peak.length - 1]).toBeGreaterThan(peak[0]);
    expect(sparkTone(peak, 'sub')).toBe('down');
  });

  it('redraws only when the history grows, the colour changes or the canvas is resized', () => {
    const a = hist(10);
    expect(sparkSig(a, 'up', 77)).toBe(sparkSig([...a], 'up', 77));
    expect(sparkSig(a, 'up', 77)).not.toBe(sparkSig(hist(11), 'up', 77));
    expect(sparkSig(a, 'up', 77)).not.toBe(sparkSig(a, 'bad', 77));
    expect(sparkSig(a, 'up', 77)).not.toBe(sparkSig(a, 'up', 54));
  });
});
