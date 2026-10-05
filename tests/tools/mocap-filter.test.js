import { describe, expect, it } from 'vitest';
import { smoothQuats, smoothSeries } from '../../scripts/tools/mocap/filter.mjs';

// A seeded noise source, so the cases are the same every run.
const noise = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };
const accel = (xs, fps) => { let s = 0; for (let i = 2; i < xs.length; i++) s += Math.abs(xs[i][0] - 2 * xs[i - 1][0] + xs[i - 2][0]) * fps * fps; return s / (xs.length - 2); };

describe('smoothing', () => {
  it('leaves a flat signal and a straight ramp exactly where they were', () => {
    const flat = Array.from({ length: 40 }, () => [1.5, -2]);
    for (const [i, v] of smoothSeries(flat, 30).entries()) { expect(v[0]).toBeCloseTo(flat[i][0], 9); expect(v[1]).toBeCloseTo(flat[i][1], 9); }
    const ramp = Array.from({ length: 40 }, (_, i) => [i * 0.05]);
    const out = smoothSeries(ramp, 30);
    // Forward and backward lag cancel in the middle of the ramp: no delay.
    for (let i = 10; i < 30; i++) expect(Math.abs(out[i][0] - ramp[i][0])).toBeLessThan(0.02);
  });

  it('cuts the acceleration of a noisy signal and keeps a step in place', () => {
    const r = noise(7);
    const noisy = Array.from({ length: 120 }, (_, i) => [Math.sin(i / 20) + r() * 0.04]);
    const out = smoothSeries(noisy, 30);
    expect(accel(out, 30)).toBeLessThan(accel(noisy, 30) * 0.3);
    const step = Array.from({ length: 60 }, (_, i) => [i < 30 ? 0 : 1]);
    const s = smoothSeries(step, 30, { minCutoff: 1.5, beta: 5 });
    expect(s[10][0]).toBeLessThan(0.05);
    expect(s[50][0]).toBeGreaterThan(0.95);
    expect(s.length).toBe(60);
  });

  it('keeps quaternions unit length and across the sign flip of a continuous turn', () => {
    const q = Array.from({ length: 30 }, (_, i) => { const a = i * 0.08; const v = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)]; return i % 7 === 3 ? v.map((x) => -x) : v; });
    const out = smoothQuats(q, 30);
    for (const o of out) expect(Math.hypot(...o)).toBeCloseTo(1, 6);
    // The signs are flipped back to one side, so the angle keeps rising instead of jumping.
    const angle = out.map((o) => 2 * Math.atan2(o[0], o[3]));
    for (let i = 1; i < angle.length; i++) expect(Math.abs(angle[i] - angle[i - 1] - 0.08)).toBeLessThan(0.05);
  });

  it('returns short series unchanged', () => {
    expect(smoothSeries([[1], [2]], 30)).toEqual([[1], [2]]);
  });
});
