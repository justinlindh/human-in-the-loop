import { describe, it, expect } from 'vitest';
import { confirmGate, CONFIRM_HOLD_MS } from './confirm-gate.js';

function clock() {
  let now = 0; let next = 1; const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } },
  };
}

describe('confirmGate', () => {
  it('confirms on the second tap after a slow read of the prompt', () => {
    const c = clock(); const g = confirmGate({ setTimer: c.setTimer, clearTimer: c.clearTimer });
    expect(g.tap()).toBe(false);
    c.advance(5000);
    expect(g.armed).toBe(true);
    expect(g.tap()).toBe(true);
    expect(g.armed).toBe(false);
  });
  it('disarms after the hold time and reports each change once', () => {
    const c = clock(); const seen = [];
    const g = confirmGate({ setTimer: c.setTimer, clearTimer: c.clearTimer, onChange: (v) => seen.push(v) });
    g.tap(); c.advance(CONFIRM_HOLD_MS);
    expect(g.armed).toBe(false);
    expect(seen).toEqual([true, false]);
    expect(g.tap()).toBe(false);
  });
  it('cancel disarms and clears the timer', () => {
    const c = clock(); const g = confirmGate({ setTimer: c.setTimer, clearTimer: c.clearTimer });
    g.tap(); g.cancel();
    expect(g.armed).toBe(false);
    expect(g.tap()).toBe(false);
  });
});
