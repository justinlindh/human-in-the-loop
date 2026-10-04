import { describe, it, expect } from 'vitest';
import { createFrameClock } from './frameclock.js';
import { createDirector } from './director.js';

// Two ui.error requests in one frame, with the audio context stalling in between.
function twoErrors(stallMs) {
  const clock = createFrameClock();
  const dir = createDirector({ seed: 3 });
  clock.advance(1 / 60, 10);
  const first = dir.cue('ui.error', clock.now);
  const stalledCtx = 10 + stallMs / 1000;
  clock.advance(0, stalledCtx);
  const second = dir.cue('ui.error', clock.now);
  return { first, second };
}

describe('frame clock', () => {
  it('does not advance on context time alone', () => {
    const c = createFrameClock();
    c.advance(0.016, 5);
    const v = c.now;
    c.advance(0, 5.9);
    expect(c.now).toBe(v);
  });

  it('caps one frame step', () => {
    const c = createFrameClock();
    c.advance(30, 1);
    expect(c.now).toBe(0.25);
  });

  it('maps virtual time to context time and back', () => {
    const c = createFrameClock();
    c.advance(0.1, 7);
    expect(c.toAudio(c.now + 0.5)).toBeCloseTo(7.5);
    expect(c.fromAudio(7.5)).toBeCloseTo(c.now + 0.5);
    expect(c.mapCommands([{ op: 'x', at: c.now + 1 }, { op: 'y' }])).toEqual([{ op: 'x', at: 8 }, { op: 'y' }]);
  });

  it('admits the same cues whether or not the context stalled', () => {
    const calm = twoErrors(0);
    const stalled = twoErrors(900);
    expect(calm.first).toHaveLength(1);
    expect(calm.second).toHaveLength(0);
    expect(stalled.first).toHaveLength(1);
    expect(stalled.second).toHaveLength(0);
  });
});

describe('seeded voice take', () => {
  it('gives every single bark an integer take, same for the same seed', () => {
    const state = { staff: [{ id: 'a', mood: 'ok', voice: { set: 'fem', variant: 0 } }] };
    const run = () => createDirector({ seed: 5 }).poke('a', state, 1)[0];
    expect(Number.isInteger(run().take)).toBe(true);
    expect(run().take).toBe(run().take);
  });
});
