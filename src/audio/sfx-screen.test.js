import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { screen, BARS } from './sfx-screen.mjs';

const SR = 48000;
// A decaying sine: `tau` is the decay time constant, `dur` the clip length, with the last 100 ms faded out when `fade`.
const ring = (tau, dur, fade = false) => {
  const n = Math.round(dur * SR);
  return Array.from({ length: n }, (_, i) => {
    const t = i / SR, f = fade ? Math.min(1, (dur - t) / 0.1) : 1;
    return Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / tau) * f;
  });
};

describe('sfx-screen', () => {
  it('passes a short dry tick', () => {
    const r = screen(ring(0.03, 0.5, true), SR);
    expect(r.failed).toEqual([]);
    expect(r.dur).toBeCloseTo(0.5, 2);
  });

  it('fails a bell that rings out past the length bar and still sounds at the end', () => {
    const r = screen(ring(0.6, 1.1), SR);
    expect(r.failed.join(' ')).toMatch(/length/);
    expect(r.failed.join(' ')).toMatch(/decay/);
    expect(r.failed.join(' ')).toMatch(/last 50 ms/);
  });

  it('fails a short clip that is cut while still loud', () => {
    const r = screen(ring(10, 0.5), SR);
    expect(r.failed.join(' ')).toMatch(/last 50 ms/);
    expect(r.failed.join(' ')).toMatch(/last 200 ms/);
  });

  it('takes the bars as a parameter', () => {
    const x = ring(0.6, 1.1);
    expect(screen(x, SR, { maxDur: 2, decay: 5, last200: 0, last50: 0 }).failed).toEqual([]);
    expect(BARS.maxDur).toBeLessThan(1);
  });

  it('exits 1 on a failing file, 0 on a passing one and 2 on bad input', () => {
    const run = (...a) => spawnSync('node', ['src/audio/sfx-screen.mjs', ...a], { encoding: 'utf8' });
    expect(run('public/audio/sfx/letter_ping.ogg').status).toBe(0);
    expect(run('public/audio/sfx/deal_handbell.ogg', '--max-dur', '0.2').status).toBe(1);
    expect(run().status).toBe(2);
    expect(run('--nope', 'x').status).toBe(2);
    expect(run('no-such-file.wav').status).toBe(1);
  });
});
