// @vitest-environment happy-dom
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIMX } from './simapi.js';
import { createAdvisors } from './advisor.js';
import { pReset } from './pclock.js';
import { B } from '../sim/balance.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterAll(() => vi.unstubAllGlobals());

const real = SIMX.advice;
const line = { key: 'runway', advisor: 'cfo', severity: 2, tier: 2, since: 1, text: 'Runway is short.' };
let listeners;
beforeEach(() => { pReset(); listeners = vi.spyOn(globalThis, 'addEventListener'); SIMX.advice = () => [line]; });
afterEach(() => {
  for (const args of listeners.mock.calls) removeEventListener(...args);
  SIMX.advice = real;
  delete B.pacing;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const run = () => {
  const layer = document.createElement('div');
  document.body.append(layer);
  const adv = createAdvisors({ ctx: { getState: () => ({ week: 10 }) }, layer });
  adv.onEvent(line);
  adv.update({ week: 10 });
  return adv;
};

describe('advisorGlow', () => {
  it('on: the button glows and pulses, and no peek card shows', () => {
    B.pacing = { advisorGlow: true };
    const adv = run();
    expect(adv.button.classList.contains('glow')).toBe(true);
    expect(adv.button.classList.contains('pulse')).toBe(true);
    expect(adv.peek.classList.contains('show')).toBe(false);
  });
  it('off: the peek card shows with the glow, as before', () => {
    B.pacing = { advisorGlow: false };
    const adv = run();
    expect(adv.button.classList.contains('glow')).toBe(true);
    expect(adv.button.classList.contains('pulse')).toBe(false);
    expect(adv.peek.classList.contains('show')).toBe(true);
  });
});
