import { describe, it, expect } from 'vitest';
import { createSpacing } from './spacing.js';

describe('popup spacing', () => {
  it('lets the first popup through, then waits for 30 s of unpaused play after each one closes', () => {
    const s = createSpacing({ gap: 30000 });
    expect(s.ready()).toBe(true);
    s.tick(16, false, true);          // a popup opens
    s.tick(5000, false, true);        // stays up for 5 s
    s.tick(16, true, false);          // closes
    expect(s.ready()).toBe(false);
    for (let i = 0; i < 29; i++) s.tick(1000, true, false);
    expect(s.ready()).toBe(false);
    s.tick(1000, true, false);
    expect(s.ready()).toBe(true);
  });

  it('does not count paused time, and a new popup restarts the wait', () => {
    const s = createSpacing({ gap: 30000 });
    s.tick(16, true, true); s.tick(16, true, false);
    s.tick(60000, false, false);      // paused for a minute
    expect(s.ready()).toBe(false);
    s.tick(20000, true, false);
    s.tick(16, true, true); s.tick(16, true, false); // a decision came and went
    s.tick(20000, true, false);
    expect(s.ready()).toBe(false);
    expect(Math.round(s.waitMs / 1000)).toBe(10);
  });

  it('is not ready on the frame a popup is still up, even long after the last close', () => {
    const s = createSpacing({ gap: 30000 });
    s.tick(16, true, true); s.tick(16, true, false);
    s.tick(40000, true, false);
    expect(s.ready()).toBe(true);
    s.tick(16, false, true);          // a decision is up (answered between frames)
    expect(s.ready()).toBe(false);
    s.tick(16, true, false);          // the close is counted here
    expect(s.ready()).toBe(false);
  });
});

