import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
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

  it('passes a 10 ms click, judged against its own length', () => {
    const click = Array.from({ length: 480 }, (_, i) => Math.sin(i / 6) * Math.exp(-i / 90));
    expect(screen(click, SR).failed).toEqual([]);
  });

  it('fails a short cue that rings for a second', () => {
    const r = screen(ring(0.25, 1.1, true), SR);
    expect(r.failed.join(' ')).toMatch(/decay/);
  });

  it('does not let trailing silence turn a ringing cue into a long clip', () => {
    const padded = [...ring(0.25, 1.1, true), ...new Array(Math.round(0.6 * SR)).fill(0)];
    expect(padded.length / SR).toBeGreaterThan(BARS.shortMax);
    expect(screen(padded, SR).failed.join(' ')).toMatch(/decay/);
  });

  it('does not let leading silence turn a ringing cue into a long clip', () => {
    const delayed = [...new Array(Math.round(0.6 * SR)).fill(0), ...ring(0.25, 1.1, true)];
    expect(delayed.length / SR).toBeGreaterThan(BARS.shortMax);
    expect(screen(delayed, SR).failed.join(' ')).toMatch(/decay/);
  });

  it('leaves the decay of a long clip to the ear', () => {
    expect(screen(ring(0.6, 3, true), SR).failed).toEqual([]);
  });

  it('fails a clip cut while still loud', () => {
    const r = screen(ring(10, 0.5), SR);
    expect(r.failed.join(' ')).toMatch(/ends at/);
  });

  it('takes the bars as a parameter', () => {
    const x = ring(0.25, 1.1, true);
    expect(screen(x, SR, { ...BARS, decay: 2 }).failed).toEqual([]);
  });

  // Decoding goes through ffmpeg, which a bare CI runner may not have.
  const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  const shipped = ['sfx', 'ui'].flatMap((d) => readdirSync(`public/audio/${d}`).filter((f) => f.endsWith('.ogg')).map((f) => `public/audio/${d}/${f}`));
  const run = (...a) => spawnSync('node', ['src/audio/sfx-screen.mjs', ...a], { encoding: 'utf8' });

  it.skipIf(!hasFfmpeg)('every shipped effect and UI sound passes the default bars', () => {
    expect(shipped.length).toBeGreaterThan(30);
    const r = run(...shipped);
    expect(r.stdout.split('\n').filter((l) => l.startsWith('FAIL'))).toEqual([]);
    expect(r.status).toBe(0);
  });

  it.skipIf(!hasFfmpeg)('exits 1 on a failing file, 0 on a passing one and 2 on bad input', () => {
    expect(run('public/audio/sfx/letter_ping.ogg').status).toBe(0);
    expect(run('public/audio/sfx/deal_handbell.ogg', '--decay', '0.2').status).toBe(1);
    expect(run().status).toBe(2);
    expect(run('--nope', 'x').status).toBe(2);
    expect(run('no-such-file.wav').status).toBe(1);
  });
});
