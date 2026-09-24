import { describe, it, expect } from 'vitest';
import { createLoops } from './loops.js';

// A minimal AudioContext stand-in that records sources.
function fakeCtx() {
  const sources = [];
  const param = () => ({ value: 1, setTargetAtTime(v) { this.value = v; } });
  return {
    currentTime: 0,
    sources,
    createBufferSource() { const s = { buffer: null, loop: false, started: false, stoppedAt: null, connect: (n) => n, start() { this.started = true; }, stop(t) { this.stoppedAt = t; } }; sources.push(s); return s; },
    createGain() { return { gain: param(), connect: (n) => n }; },
  };
}

function fakeLoader({ real = false } = {}) {
  let ready = real;
  let waiter = null;
  return {
    ready: () => ready,
    get: (id) => (ready ? { id, kind: 'real', sampleRate: 48000 } : { id, kind: 'placeholder' }),
    meta: () => ({ file: 'ambience/typing.ogg', loopStart: 0, loopEnd: 384000 }),
    sampleRate: () => 48000,
    whenReady: (id, cb) => { waiter = cb; },
    decode: () => { ready = true; waiter?.(true); },
    fail: () => { waiter?.(false); },
  };
}

describe('audio loops', () => {
  it('starts on the placeholder and crossfades to the delivered file when it decodes', () => {
    const ctx = fakeCtx();
    const loader = fakeLoader();
    const loops = createLoops(ctx, loader, () => ({}));
    loops.set({ id: 'ambience/typing', gain: 0.4 });
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer.kind).toBe('placeholder');
    expect(loops.state('ambience/typing').real).toBe(false);
    loader.decode();
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[1].buffer.kind).toBe('real');
    expect(ctx.sources[1].loopEnd).toBeCloseTo(8, 5);
    expect(ctx.sources[0].stoppedAt).not.toBeNull();
    expect(loops.state('ambience/typing')).toEqual({ real: true, level: 0.4 });
  });

  it('starts on the delivered file when it is already decoded, and stays on the placeholder if it fails', () => {
    const a = fakeCtx();
    createLoops(a, fakeLoader({ real: true }), () => ({})).set({ id: 'ambience/typing', gain: 0.3 });
    expect(a.sources).toHaveLength(1);
    expect(a.sources[0].buffer.kind).toBe('real');
    const b = fakeCtx();
    const loader = fakeLoader();
    createLoops(b, loader, () => ({})).set({ id: 'ambience/typing', gain: 0.3 });
    loader.fail();
    expect(b.sources).toHaveLength(1);
  });

  it('does not start a silent loop', () => {
    const ctx = fakeCtx();
    createLoops(ctx, fakeLoader(), () => ({})).set({ id: 'ambience/typing', gain: 0 });
    expect(ctx.sources).toHaveLength(0);
  });
});
