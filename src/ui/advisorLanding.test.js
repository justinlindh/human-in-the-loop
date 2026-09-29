import { describe, it, expect } from 'vitest';
import { landingOf } from './panels/staff.js';
import { openTarget } from './openTarget.js';

describe('advisor landing hints', () => {
  it('reads assign, focus and note, and ignores an unknown focus', () => {
    expect(landingOf(null)).toBe(null);
    expect(landingOf({ staffId: 'a' })).toBe(null);
    expect(landingOf({ assign: { type: 'idle' }, note: 'Lighter.' })).toEqual({ assign: { type: 'idle' }, focus: null, note: 'Lighter.' });
    expect(landingOf({ focus: 'timeOff' }).focus).toBe('timeOff');
    expect(landingOf({ focus: 'bogus', note: 'x' }).focus).toBe(null);
  });

  it('opens Staff with the hints from a target', () => {
    const calls = [];
    const ctx = { open: (id, arg) => calls.push([id, arg]) };
    openTarget(ctx, { panel: 'staff', arg: 'p1', assign: { type: 'project', targetId: 'j1' }, note: 'why' });
    expect(calls[0]).toEqual(['staff', { staffId: 'p1', tab: undefined, assign: { type: 'project', targetId: 'j1' }, focus: undefined, note: 'why' }]);
    openTarget(ctx, { panel: 'staff', tab: 'hire' });
    expect(calls[1][1].tab).toBe('hire');
    openTarget(ctx, { panel: 'staff', arg: 'p2' });
    expect(calls[2]).toEqual(['staff', { staffId: 'p2' }]);
  });
});
