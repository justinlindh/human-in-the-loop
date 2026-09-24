import { describe, it, expect } from 'vitest';
import { createPacer, WEEK_SECONDS, BUBBLE_SECONDS, MAX_STEP, replyDelay } from './pacing.js';

const chat = (id, fromId, text, replyTo = null) => ({ type: 'chat', id, fromId, from: fromId, text, replyTo, channel: 'general', reactions: {} });

// Steps the pacer at 30 fps for `seconds`, collecting releases with their real time.
function run(p, seconds, { speed = 1, running = true } = {}) {
  const out = [];
  for (let t = 0; t < seconds; t += 1 / 30) {
    p.step(1 / 30, { speed, running });
    for (const e of p.due()) out.push({ e, t: p.realT, g: p.gameT });
  }
  return out;
}

describe('pacer clock', () => {
  it('ticks one week per WEEK_SECONDS / speed and caps long frames', () => {
    const p = createPacer();
    let weeks = 0;
    for (let i = 0; i < 30 * WEEK_SECONDS; i++) if (p.step(1 / 30, { speed: 2, running: true })) weeks++;
    expect(weeks).toBe(2);
    const q = createPacer();
    q.step(10, { speed: 1, running: true });
    expect(q.acc).toBeCloseTo(MAX_STEP);
  });

  it('holds game time while not running but keeps real time', () => {
    const p = createPacer();
    expect(p.step(0.1, { speed: 1, running: false })).toBe(false);
    expect(p.acc).toBe(0);
    expect(p.realT).toBeCloseTo(0.1);
  });
});

describe('pacer scheduling', () => {
  it('presents immediate events now and spreads the rest', () => {
    const p = createPacer();
    const now = p.schedule([{ type: 'decision' }, { type: 'toast', text: 'a' }, { type: 'toast', text: 'b' }]);
    expect(now.map((e) => e.type)).toEqual(['decision']);
    const out = run(p, WEEK_SECONDS);
    expect(out.map((x) => x.e.text)).toEqual(['a', 'b']);
    expect(out[1].g).toBeGreaterThan(1);
  });

  it('releases a reply only after its parent plus the reading delay, scaled by speed', () => {
    for (const speed of [1, 2]) {
      const p = createPacer();
      const root = chat('m1', 's1', 'x'.repeat(50));
      p.schedule([root, chat('m2', 's2', 'ok', 'm1')]);
      const out = run(p, WEEK_SECONDS / speed, { speed });
      const [a, b] = out;
      expect(a.e.id).toBe('m1');
      expect(b.g - a.g).toBeGreaterThanOrEqual(replyDelay(root.text) - 1e-6);
      expect(b.t - a.t).toBeLessThan(replyDelay(root.text) / speed + 0.1);
    }
  });

  it('never gives one speaker two bubbles at once', () => {
    const p = createPacer();
    p.schedule([chat('m1', 's1', 'one'), chat('m2', 's1', 'two'), chat('m3', 's2', 'hey', 'm1'), chat('m4', 's1', 'three', 'm1')]);
    const out = run(p, 3 * WEEK_SECONDS).filter((x) => x.e.fromId === 's1');
    for (let i = 1; i < out.length; i++) expect(out[i].t - out[i - 1].t).toBeGreaterThanOrEqual(BUBBLE_SECONDS - 1e-6);
  });

  it('carries waiting chat into the next week once, then sends it to the feed without a bubble', () => {
    const p = createPacer();
    const lines = [1, 2, 3, 4, 5].map((i) => chat(`m${i}`, 's1', `line ${i}`));
    p.schedule(lines);
    run(p, 0.5);
    p.schedule([]);
    run(p, 0.5);
    const flushed = p.schedule([]);
    const quiet = p.takeQuiet();
    expect(flushed.length + quiet.length).toBeGreaterThan(0);
    expect(quiet.every((e) => e.fromId === 's1')).toBe(true);
    expect(p.queued).toBe(0);
  });
});
