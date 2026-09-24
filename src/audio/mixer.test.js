import { describe, it, expect } from 'vitest';
import { createMixer } from './mixer.js';
import { DUCK } from './manifest.js';

// An AudioContext stand-in whose params record their automation.
function fakeCtx() {
  const param = (v = 1) => ({
    value: v, events: [],
    setTargetAtTime(target, t, tc) { this.events.push(['target', target, t, tc]); },
    setValueAtTime(val, t) { this.events.push(['value', val, t]); },
    cancelScheduledValues(t) { this.events.push(['cancel', t]); },
  });
  const node = () => ({ gain: param(), frequency: param(20000), connect(n) { return n; } });
  return {
    currentTime: 0,
    destination: {},
    createGain: node,
    createBiquadFilter: node,
    createDynamicsCompressor: () => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: (n) => n }),
  };
}


describe('music ducks', () => {
  function setup() {
    const ctx = fakeCtx();
    const made = [];
    const orig = ctx.createGain;
    ctx.createGain = () => { const n = orig(); made.push(n); return n; };
    const mix = createMixer(ctx);
    // Gains in creation order: master, the five buses, level, duck.
    const duck = made.at(-1).gain;
    const targets = () => duck.events.filter((e) => e[0] === 'target').map(([, v, t, tc]) => [v, +t.toFixed(3), +tc.toFixed(3)]);
    return { ctx, mix, duck, targets };
  }

  it('ducks a stinger for its length: down over the attack, back over the release', () => {
    const { mix, targets } = setup();
    mix.hold('stinger', 0, 4);
    expect(targets()).toEqual([[DUCK.stinger.music, 0, +(DUCK.stinger.attack / 3).toFixed(3)], [1, 4, +(DUCK.stinger.release / 3).toFixed(3)]]);
  });

  it('extends the hold for overlapping stingers instead of stacking', () => {
    const { ctx, mix, duck, targets } = setup();
    mix.hold('stinger', 0, 4);
    ctx.currentTime = 2;
    duck.events.length = 0;
    mix.hold('stinger', 2, 7.5);
    // One level (not deeper), released once, at the later end.
    expect(targets()).toEqual([[DUCK.stinger.music, 2, +(DUCK.stinger.attack / 3).toFixed(3)], [1, 7.5, +(DUCK.stinger.release / 3).toFixed(3)]]);
  });

  it('keeps the deepest duck and returns to the shallower one when it ends', () => {
    const { mix, targets } = setup();
    mix.hold('voice', 0, 10);
    mix.hold('stinger', 2, 5);
    const t = targets();
    expect(t[0][0]).toBe(DUCK.voice.music);
    expect(t).toContainEqual([DUCK.stinger.music, 2, +(DUCK.stinger.attack / 3).toFixed(3)]);
    expect(t).toContainEqual([DUCK.voice.music, 5, +(DUCK.stinger.release / 3).toFixed(3)]);
    expect(t.at(-1)).toEqual([1, 10, +(DUCK.voice.release / 3).toFixed(3)]);
  });

  it('holds an open-ended duck until its end is set', () => {
    const { ctx, mix, targets, duck } = setup();
    const id = mix.hold('dance', 0);
    expect(targets()).toEqual([[DUCK.dance.music, 0, +(DUCK.dance.attack / 3).toFixed(3)]]);
    ctx.currentTime = 1;
    duck.events.length = 0;
    mix.endHold(id, 19.2);
    expect(targets()).toEqual([[DUCK.dance.music, 1, +(DUCK.dance.attack / 3).toFixed(3)], [1, 19.2, +(DUCK.dance.release / 3).toFixed(3)]]);
  });

  it('keeps ramping toward the target when a hold is rescheduled mid-ramp', () => {
    const { ctx, mix, duck, targets } = setup();
    const id = mix.hold('dance', 0);
    ctx.currentTime = 0.1;
    duck.events.length = 0;
    mix.endHold(id, 19);
    expect(targets()[0]).toEqual([DUCK.dance.music, 0.1, +(DUCK.dance.attack / 3).toFixed(3)]);
    expect(targets().at(-1)).toEqual([1, 19, +(DUCK.dance.release / 3).toFixed(3)]);
  });
});
