import { describe, it, expect } from 'vitest';
import { createPacer, createFrameClock, LOGIC_STEP, MAX_CATCHUP, WEEK_SECONDS, MAX_STEP, readSeconds, createAttention } from './pacing.js';
import { B } from './sim/balance.js';

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
    expect(readSeconds('')).toBe(B.readMinimumSeconds + B.readFadeSeconds);
    expect(readSeconds('x'.repeat(40))).toBeCloseTo(B.readBaseSeconds + B.readSecondsPerChar * 40);
    expect(readSeconds('x'.repeat(500))).toBe(B.readMaxSeconds);
    for (const text of ['ok', 'x'.repeat(40), 'x'.repeat(200)]) {
      expect(readSeconds(text, 2)).toBeGreaterThanOrEqual(0.7 * readSeconds(text, 1));
      expect(readSeconds(text, 4)).toBeLessThanOrEqual(readSeconds(text, 2));
    }
  });
  it('never drops below the time it takes to read the line at faster speeds', () => {
    for (const n of [10, 40, 70, 100, 140]) {
      const text = 'x'.repeat(n);
      const reading = Math.min(B.readMaxSeconds, B.readFloorSeconds + n / B.readCharsPerSecond);
      for (const speed of [1, 2, 4]) expect(readSeconds(text, speed)).toBeGreaterThanOrEqual(reading - 1e-9);
    }
    // A 70-character line: unchanged at 1x, held to its reading time at 2x and 4x.
    expect(readSeconds('x'.repeat(70), 1)).toBeCloseTo(B.readBaseSeconds + B.readSecondsPerChar * 70);
    expect(readSeconds('x'.repeat(70), 2)).toBeCloseTo(B.readFloorSeconds + 70 / B.readCharsPerSecond);
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

  it('presents an incident resolution with the postmortem decision raised in the same tick', () => {
    const p = createPacer();
    const now = p.schedule([{ type: 'incidentResolved', helped: ['a'], hurt: [] }, { type: 'decision' }]);
    expect(now.map((e) => e.type)).toEqual(['incidentResolved', 'decision']);
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

it('hands tagged dialogue to the renderer while the weekly clock is held', () => {
  const p = createPacer();
  const lines = [
    { type: 'say', id: 'first', staffId: 'a', text: 'A line that takes time to read.', moment: 'reward' },
    { type: 'say', id: 'second', staffId: 'a', text: 'The important reply.', replyTo: 'first', moment: 'reward' },
  ];
  expect(p.schedule(lines)).toEqual(lines);
  expect(run(p, 20, { running: false })).toEqual([]);
  expect(p.queued).toBe(0);
  expect(p.takeDropped()).toEqual([]);
});

describe('fixed-step game loop', () => {
  // The loop as main.js runs it: a frame's real time goes through the frame clock, and every whole
  // logic step advances the pacer.
  function weeksIn(seconds, fps, speed = 1) {
    const p = createPacer(); const clock = createFrameClock();
    let weeks = 0;
    const frames = Math.round(seconds * fps);
    for (let f = 0; f < frames; f++) {
      const n = clock.advance(1 / fps);
      for (let i = 0; i < n; i++) if (p.step(clock.step, { speed, running: true })) weeks++;
    }
    return { weeks, gameT: p.gameT };
  }

  it('gives the same game time at any frame rate', () => {
    for (const speed of [1, 2, 4]) {
      const at = [2, 5, 15, 32, 60, 144].map((fps) => weeksIn(64, fps, speed));
      for (const r of at) {
        expect(r.weeks).toBe(at[0].weeks);
        expect(r.gameT).toBeCloseTo(64 * speed, 1);
      }
    }
    // 16 s at 1x is two weeks whether the machine draws 32 frames a second or 2.
    expect(weeksIn(16, 32).weeks).toBe(2);
    expect(weeksIn(16, 2).weeks).toBe(2);
  });

  it('runs the steps a slow frame is owed, and no more than the catch-up cap', () => {
    const c = createFrameClock();
    expect(c.advance(0.5)).toBe(32);
    expect(c.advance(MAX_CATCHUP * 10)).toBe(Math.floor(MAX_CATCHUP / LOGIC_STEP + 1e-9));
    expect(c.advance(600)).toBe(Math.floor(MAX_CATCHUP / LOGIC_STEP + 1e-9));
  });

  it('carries the remainder of a fast frame to the next one', () => {
    const c = createFrameClock();
    let steps = 0;
    for (let f = 0; f < 144; f++) steps += c.advance(1 / 144);
    expect(steps).toBe(64);
  });

  it('ignores negative and non-numeric time, and reset drops the pending remainder', () => {
    const c = createFrameClock();
    expect(c.advance(-5)).toBe(0);
    expect(c.advance(NaN)).toBe(0);
    expect(c.advance(undefined)).toBe(0);
    c.advance(LOGIC_STEP / 2);
    expect(c.pending).toBeGreaterThan(0);
    c.reset();
    expect(c.pending).toBe(0);
  });
});

// Runs the attention clock in one-second frames, answering each ask the moment it opens.
function drive(att, seconds, asks, opts = {}) {
  const opened = [];
  const expired = [];
  for (let i = 0; i < seconds; i++) {
    const r = att.tick(1, { asks: asks.slice(), ...opts });
    for (const id of r.expire) { expired.push([att.playSeconds, id]); asks.splice(asks.findIndex((a) => a.id === id), 1); }
    if (r.present) { opened.push([att.playSeconds, r.present]); asks.splice(asks.findIndex((a) => a.id === r.present), 1); }
  }
  return { opened, expired };
}
const ask = (id, priority = 'normal') => ({ id, priority });

describe('attention clock', () => {
  it('keeps asks at least 90 s apart and opens one at a time', () => {
    const att = createAttention({ watchWindow: 1e9 });
    const { opened } = drive(att, 400, [ask('a'), ask('b'), ask('c')], { expiry: false });
    expect(opened.map((o) => o[1])).toEqual(['a', 'b', 'c']);
    expect(opened[1][0] - opened[0][0]).toBeGreaterThanOrEqual(90);
    expect(opened[2][0] - opened[1][0]).toBeGreaterThanOrEqual(90);
  });

  it('does not open an ask while one is open or a modal is up', () => {
    expect(drive(createAttention(), 200, [ask('a')], { askOpen: true, expiry: false }).opened).toEqual([]);
    expect(drive(createAttention(), 200, [ask('a')], { modal: true, expiry: false }).opened).toEqual([]);
  });

  it('waits 45 s after a modal closes', () => {
    const att = createAttention();
    att.tick(1, { modal: true });
    const { opened } = drive(att, 100, [ask('a')]);
    expect(opened[0][0]).toBeGreaterThanOrEqual(46);
  });

  it('spends nothing while the game is not running', () => {
    const att = createAttention();
    drive(att, 500, [ask('a')], { running: false });
    expect(att.playSeconds).toBe(0);
  });

  it('opens an emergency first, but only after the quiet', () => {
    const att = createAttention();
    att.tick(1, { modal: true });
    att.tick(1, { modal: false });
    const { opened } = drive(att, 60, [ask('n'), ask('e', 'emergency')], { expiry: false });
    expect(opened[0][1]).toBe('e');
    expect(opened[0][0]).toBeGreaterThanOrEqual(46);
    expect(opened.length).toBe(1);
  });

  it('expires a non-emergency ask after 180 s of play and never an emergency', () => {
    const asks = [ask('n'), ask('e', 'emergency')];
    const { expired } = drive(createAttention(), 400, asks, { askOpen: true, decisionOpen: true });
    expect(expired).toEqual([[180, 'n']]);
    expect(asks.map((a) => a.id)).toEqual(['e']);
  });

  it('does not expire when expiry is off', () => {
    expect(drive(createAttention(), 400, [ask('n')], { askOpen: true, expiry: false }).expired).toEqual([]);
  });

  it('keeps a 180 s stretch with no ask in every 10 min', () => {
    const att = createAttention();
    const asks = Array.from({ length: 60 }, (_, i) => ask(`a${i}`));
    const { opened } = drive(att, 3000, asks, { expiry: false });
    const times = opened.map((o) => o[0]);
    for (let w = 0; w + 600 <= 3000; w += 600) {
      const edges = [w, ...times.filter((x) => x >= w && x <= w + 600), w + 600];
      let best = 0;
      for (let i = 1; i < edges.length; i++) best = Math.max(best, edges[i] - edges[i - 1]);
      expect(best).toBeGreaterThanOrEqual(180);
    }
  });

  it('shrinks gaps with speed when real time is off, and holds them when it is on', () => {
    const run = (realTime) => drive(createAttention({ watchWindow: 1e9 }), 600,
      Array.from({ length: 20 }, (_, i) => ask(`a${i}`)), { speed: 4, realTime, expiry: false }).opened.length;
    expect(run(true)).toBeLessThan(run(false));
  });

  it('does not treat the player\'s own menus as beats', () => {
    // A menu pauses the clock (running false) without a beat: no quiet follows it.
    const att = createAttention();
    att.tick(1, { running: true });
    for (let i = 0; i < 60; i++) att.tick(1, { running: false, modal: false });
    expect(drive(att, 5, [ask('a')], { expiry: false }).opened[0][0]).toBe(2);
  });

  it('lets only an open decision block an emergency', () => {
    const att = createAttention();
    const asks = [ask('e', 'emergency')];
    expect(drive(att, 60, asks.slice(), { askOpen: true, expiry: false }).opened.length).toBe(1);
    expect(drive(createAttention(), 60, [ask('e', 'emergency')], { askOpen: true, decisionOpen: true, expiry: false }).opened).toEqual([]);
    expect(drive(createAttention(), 60, [ask('n')], { askOpen: true, expiry: false }).opened).toEqual([]);
  });

  it('starts a staged moment\'s quiet when the moment begins', () => {
    const att = createAttention();
    att.tick(1, { running: true });
    att.momentBegun();
    for (let i = 0; i < 25; i++) att.tick(1, { running: false, held: true });
    // 25 s of hold counted: 20 more seconds of play finishes the 45 s quiet.
    const { opened } = drive(att, 40, [ask('a')], { expiry: false });
    expect(opened[0][0] - 1).toBe(45);
  });

  it('keeps time for staged moments with no asks queued', () => {
    const att = createAttention();
    for (let round = 0; round < 3; round++) {
      expect(att.momentReady()).toBe(true);
      att.momentBegun();
      expect(att.momentReady()).toBe(false);
      drive(att, 301, [], { asks: [] });
    }
  });

  it('allows one staged moment per 5 min', () => {
    const att = createAttention();
    expect(att.momentReady()).toBe(true);
    att.momentBegun();
    drive(att, 200, []);
    expect(att.momentReady()).toBe(false);
    drive(att, 101, []);
    expect(att.momentReady()).toBe(true);
    expect(att.momentCap).toBe(25);
  });
});
