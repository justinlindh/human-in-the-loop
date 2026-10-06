import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { shortText } from '../../src/sim/util.js';

describe('status toasts carry a short bubble text', () => {
  it('shortText keeps 32 characters at most and marks a cut', () => {
    expect(shortText('75% done')).toBe('75% done');
    const cut = shortText('Trend: an extraordinarily long trend name here');
    expect(cut.length).toBeLessThanOrEqual(32);
    expect(cut.startsWith('Trend: an extraordinarily')).toBe(true);
    expect(cut.endsWith('...')).toBe(true);
  });

  it('every toast with a topic has a short of 1 to 32 characters, and toasts without one have none', () => {
    const seen = new Set();
    for (const [bot, seed] of [['balanced', 1], ['sensible', 2], ['allHumans', 3]]) {
      runBot(bot, seed, 520, { onWeek: (s, events) => {
        for (const e of events.filter((x) => x.type === 'toast')) {
          if (e.topic) {
            seen.add(e.topic);
            expect(typeof e.short, `${e.topic}: ${e.text}`).toBe('string');
            expect(e.short.length, e.short).toBeGreaterThan(0);
            expect(e.short.length, e.short).toBeLessThanOrEqual(32);
          } else {
            expect(e.short, e.text).toBeUndefined();
          }
        }
      } });
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});
