import { describe, it, expect } from 'vitest';
import { createDance } from './dance.js';

function fakeCtx() {
  const sources = [];
  return {
    currentTime: 0,
    sources,
    createBufferSource() { const s = { buffer: null, startAt: null, onended: null, connect: (n) => n, start(t) { this.startAt = t; } }; sources.push(s); return s; },
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
  const ducks = [];
  const ran = [];
  const dance = createDance(ctx, loader, {
    duck: (k, on) => ducks.push([k, on, ctx.currentTime]),
    out: () => ({}),
    run: (cmds) => ran.push(...cmds),
    later: (fn, ms) => timers.push([fn, ms]),
  });
  // Advance the wall clock and the audio clock together, firing due timers.
  const advance = (ms) => {
    elapsed += ms; ctx.currentTime += ms / 1000;
    const due = timers.splice(0);
    for (const [fn] of due) fn();
  };
  return { ctx, dance, ducks, ran, advance, timers };
}

const cmd = { op: 'dance', file: 'musicNight/sad_lofi', gain: 0.75, at: 0.4, duck: 'dance', expect: 17.78,
  after: [{ op: 'play', cue: 'voice.bark', at: 0.2 }, { op: 'duck', key: 'cheer', on: false, at: 1.9 }] };

describe('music night playback', () => {
  it('waits for a delivered track that is still decoding, then plays the real one', () => {
    const t = setup({ readyAfterMs: 1000 });
    t.dance.play(cmd);
    expect(t.ducks).toEqual([['dance', true, 0]]);
    expect(t.ctx.sources).toHaveLength(0);
    for (let i = 0; i < 4; i++) t.advance(250);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0].buffer.kind).toBe('real');
    expect(t.ctx.sources[0].startAt).toBeCloseTo(1.4);
  });

  it('falls back to the placeholder after about 3 s', () => {
    const t = setup({ readyAfterMs: null });
    t.dance.play(cmd);
    for (let i = 0; i < 12; i++) t.advance(250);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0].buffer.kind).toBe('placeholder');
    expect(t.timers).toHaveLength(0);
  });

  it('plays the placeholder at once when no track is delivered', () => {
    const t = setup({ delivered: false });
    t.dance.play(cmd);
    expect(t.ctx.sources).toHaveLength(1);
    expect(t.ctx.sources[0].startAt).toBeCloseTo(0.4);
  });

  it('releases the duck and plays the cheer when the buffer actually ends', () => {
    const t = setup({ delivered: false });
    t.dance.play(cmd);
    expect(t.ran).toHaveLength(0);
    t.ctx.currentTime = 16.4; // the placeholder's real end, not the delivered track's length
    t.ctx.sources[0].onended();
    expect(t.ducks.at(-1)).toEqual(['dance', false, 16.4]);
    expect(t.ran.map((c) => c.at)).toEqual([16.6, 18.3].map((x) => expect.closeTo(x, 5)));
  });
});
