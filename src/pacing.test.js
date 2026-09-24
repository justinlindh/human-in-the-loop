import { describe, it, expect } from 'vitest';
import { createPacer, WEEK_SECONDS, MAX_STEP, readSeconds, READ } from './pacing.js';

const say = (id, staffId, text, replyTo = null) => ({ type: 'say', id, week: 0, staffId, text, toId: null, replyTo });
const chat = (id, fromId, text) => ({ type: 'chat', id, fromId, from: fromId, text, replyTo: null, channel: 'general', reactions: {} });

// Steps the pacer at 30 fps for `seconds`, collecting releases with their real time.
function run(p, seconds, { speed = 1, running = true } = {}) {
  const out = [];
  for (let t = 0; t < seconds; t += 1 / 30) {
    p.step(1 / 30, { speed, running });
    for (const e of p.due()) out.push({ e, t: p.realT, g: p.gameT });
  }
  return out;
}

describe('readSeconds', () => {
  it('grows with length within its bounds, and speed shortens it only a little', () => {
    expect(readSeconds('')).toBe(READ.min);
    expect(readSeconds('x'.repeat(40))).toBeCloseTo(READ.base + READ.perChar * 40);
    expect(readSeconds('x'.repeat(500))).toBe(READ.max);
    for (const text of ['ok', 'x'.repeat(40), 'x'.repeat(200)]) {
      expect(readSeconds(text, 2)).toBeGreaterThanOrEqual(0.7 * readSeconds(text, 1));
      expect(readSeconds(text, 4)).toBeLessThanOrEqual(readSeconds(text, 2));
    }
  });
});

describe('pacer clock', () => {
  it('ticks one week per WEEK_SECONDS / speed and caps long frames', () => {
    const p = createPacer();
    let weeks = 0;
    // WEEK_SECONDS real seconds at 2x is two weeks; one extra frame absorbs float drift.
    for (let i = 0; i <= 30 * WEEK_SECONDS; i++) if (p.step(1 / 30, { speed: 2, running: true })) weeks++;
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

  it('releases a reply only after the line it answers has been up for its reading time', () => {
    const gaps = {};
    for (const speed of [1, 2]) {
      const p = createPacer();
      const first = say('v1', 's1', 'x'.repeat(50));
      const second = say('v2', 's2', 'ok then', 'v1');
      p.schedule([first, second, say('v3', 's1', 'good', 'v2')]);
      const out = run(p, 3 * WEEK_SECONDS / speed, { speed });
      expect(out.map((x) => x.e.id)).toEqual(['v1', 'v2', 'v3']);
      expect(out[1].t - out[0].t).toBeGreaterThanOrEqual(readSeconds(first.text, speed) - 1e-6);
      expect(out[1].t - out[0].t).toBeLessThan(readSeconds(first.text, speed) + 0.1);
      expect(out[2].t - out[1].t).toBeGreaterThanOrEqual(readSeconds(second.text, speed) - 1e-6);
      gaps[speed] = out[1].t - out[0].t;
    }
    // Reading time barely shrinks with game speed.
    expect(gaps[2]).toBeGreaterThanOrEqual(0.7 * gaps[1]);
  });

  it('never gives one speaker two bubbles at once', () => {
    const p = createPacer();
    const lines = [say('v1', 's1', 'one'), say('v2', 's1', 'two'), say('v3', 's2', 'hey', 'v1'), say('v4', 's1', 'three', 'v3')];
    p.schedule(lines);
    const out = run(p, 4 * WEEK_SECONDS).filter((x) => x.e.staffId === 's1');
    expect(out.length).toBe(3);
    for (let i = 1; i < out.length; i++) expect(out[i].t - out[i - 1].t).toBeGreaterThanOrEqual(readSeconds(out[i - 1].e.text) - 1e-6);
  });

  it('holds a conversation while the game is paused', () => {
    const p = createPacer();
    p.schedule([say('v1', 's1', 'first line'), say('v2', 's2', 'reply', 'v1')]);
    expect(run(p, 0.1).map((x) => x.e.id)).toEqual(['v1']);
    expect(run(p, 20, { running: false })).toEqual([]);
    expect(run(p, readSeconds('first line') + 0.2).map((x) => x.e.id)).toEqual(['v2']);
  });

  it('does not hold Yak chat for speakers', () => {
    const p = createPacer();
    p.schedule([say('v1', 's1', 'spoken'), chat('m1', 's1', 'posted'), chat('m2', 's1', 'posted again')]);
    expect(run(p, WEEK_SECONDS).map((x) => x.e.id)).toEqual(['v1', 'm1', 'm2']);
  });

  it('carries a waiting line into the next week once, then drops it if the speaker is still talking', () => {
    const p = createPacer();
    p.schedule([1, 2, 3, 4, 5].map((i) => say(`v${i}`, 's1', `line ${i}`)));
    run(p, 0.5);
    p.schedule([]);
    run(p, 0.5);
    const flushed = p.schedule([]);
    const gone = p.takeDropped();
    expect(flushed.length).toBe(0);
    expect(gone.map((e) => e.id)).toEqual(['v2', 'v3', 'v4', 'v5']);
    expect(p.queued).toBe(0);
    expect(p.takeDropped()).toEqual([]);
  });
});
