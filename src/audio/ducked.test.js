import { describe, it, expect } from 'vitest';
import { createDucked } from './ducked.js';

function fakeCtx() {
  const sources = [];
  return {
    currentTime: 0,
    sources,
    createBufferSource() { const s = { buffer: null, startAt: null, offset: 0, stopped: false, connect: (n) => n, start(t, off = 0) { this.started = t; this.offset = off; }, stop(t) { this.stopped = true; this.stoppedAt = t; } }; sources.push(s); return s; },
    createGain() { return { gain: { value: 1 }, connect: (n) => n }; },
  };
}

function setup({ delivered = true, readyAfterMs = null } = {}) {
  const ctx = fakeCtx();
  let elapsed = 0;
  const timers = [];
  const loader = {
    meta: () => (delivered ? { file: 'music_night/sad_lofi.ogg', duration: 17.78 } : null),
    ready: () => delivered && readyAfterMs !== null && elapsed >= readyAfterMs,
    preload() {},
    get: (id) => (loader.ready(id) ? { kind: 'real', duration: 17.78 } : { kind: 'placeholder', duration: 16 }),
  };
  const holds = new Map();
  let n = 0;
  const mix = {
    hold: (key, from, to = Infinity) => { holds.set(++n, { key, from, to }); return n; },
    endHold: (id, to) => { holds.get(id).to = to; },
  };
  const ran = [];
  const ducked = createDucked(ctx, loader, { mix, out: () => ({}), run: (cmds) => ran.push(...cmds), later: (fn, ms) => timers.push([fn, ms]) });
  // Advance the wall clock and the audio clock together, firing due timers.
  const advance = (ms) => {
    elapsed += ms; ctx.currentTime += ms / 1000;
    for (const [fn] of timers.splice(0)) fn();
  };
  return { ctx, ducked, holds: () => [...holds.values()], ran, advance, timers };
}

const cmd = { op: 'dance', file: 'musicNight/sad_lofi', gain: 0.75, at: 0.4, duck: 'dance', expect: 17.78,
  after: [{ op: 'play', cue: 'voice.bark', at: 0.2 }, { op: 'duck', key: 'cheer', on: false, at: 1.9 }] };

describe('ducked playback', () => {
  it('holds the duck while a delivered track decodes, then plays the real one and holds for its length', () => {
    const t = setup({ readyAfterMs: 1000 });
    t.ducked.play(cmd, { wait: true, pausable: true });
    expect(t.holds()).toEqual([{ key: 'dance', from: 0, to: Infinity }]);
    expect(t.ctx.sources).toHaveLength(0);
    for (let i = 0; i < 4; i++) t.advance(250);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0].buffer.kind).toBe('real');
    expect(t.ctx.sources[0].startAt).toBeCloseTo(1.4);
    expect(t.holds()[0].to).toBeCloseTo(1.4 + 17.78);
  });

  it('falls back to the placeholder after about 3 s and times everything to it', () => {
    const t = setup({ readyAfterMs: null });
    t.ducked.play(cmd, { wait: true, pausable: true });
    for (let i = 0; i < 12; i++) t.advance(250);
    expect(t.ctx.sources).toHaveLength(1);
    const src = t.ctx.sources[0];
    expect(src.buffer.kind).toBe('placeholder');
    expect(t.timers).toHaveLength(0);
    expect(t.holds()[0].to).toBeCloseTo(src.startAt + 16);
    // The cheer waits in the queue until it is nearly due, then goes out with absolute times.
    t.ducked.pump();
    expect(t.ran).toHaveLength(0);
    t.ctx.currentTime = src.startAt + 15.9;
    t.ducked.pump();
    expect(t.ran.map((c) => c.at)).toEqual([0.2, 1.9].map((x) => expect.closeTo(src.startAt + 16 + x, 5)));
  });

  it('plays at once when no track is delivered', () => {
    const t = setup({ delivered: false });
    t.ducked.play(cmd, { wait: true, pausable: true });
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0].startAt).toBeCloseTo(0.4);
    expect(t.holds()[0].to).toBeCloseTo(16.4);
  });

  it('holds a stinger duck for its buffer length', () => {
    const t = setup({ delivered: false });
    t.ducked.play({ op: 'play', file: 'stingers/launch', gain: 1, at: 0, duck: 'stinger' });
    t.ctx.currentTime = 1;
    t.ducked.play({ op: 'play', file: 'stingers/era', gain: 1, at: 1, duck: 'stinger' });
    expect(t.holds()).toEqual([{ key: 'stinger', from: 0, to: 16 }, { key: 'stinger', from: 1, to: 17 }]);
    expect(t.ran).toHaveLength(0);
  });

  it('pauses the dance track, holds its duck and cheer, and resumes from the same spot', () => {
    const t = setup({ delivered: false });
    t.ducked.play(cmd, { wait: true, pausable: true });
    const first = t.ctx.sources[0];
    t.ctx.currentTime = 5.4;                 // 5 s into the 16 s placeholder
    t.ducked.pause();
    expect(first.stopped).toBe(true);
    expect(first.stoppedAt).toBe(5.4);
    expect(t.holds()[0].to).toBe(Infinity);  // the era bed stays down while paused
    t.ctx.currentTime = 30;                  // long past the original end: no cheer
    t.ducked.pump();
    expect(t.ran).toHaveLength(0);
    t.ducked.resume();
    const second = t.ctx.sources[1];
    expect(second.offset).toBeCloseTo(5);
    expect(t.holds()[0].to).toBeCloseTo(30 + 11);
    t.ctx.currentTime = 40.9;
    t.ducked.pump();
    expect(t.ran[0].at).toBeCloseTo(41.2);
  });

  it('stingers are not paused', () => {
    const t = setup({ delivered: false });
    t.ducked.play({ op: 'play', file: 'stingers/win', gain: 1, at: 0, duck: 'stinger' });
    t.ducked.pause();
    expect(t.ctx.sources[0].stopped).toBe(false);
    expect(t.holds()[0].to).toBe(16);
  });
});
