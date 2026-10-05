import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

describe('alumni', () => {
  it('shows up in real runs, and the state stays JSON-safe', () => {
    let seen = 0;
    for (const seed of [1, 2, 3]) {
      let last = null;
      runBot('balanced', seed, 700, { setup: (s) => { last = s; }, onWeek: (s) => {
        const id = s.pendingDecision?.eventId ?? '';
        if (/^alumni_|^hearing_|^ai_summit/.test(id)) seen++;
      } });
      expect(() => JSON.parse(JSON.stringify(last.flags.alumni ?? []))).not.toThrow();
      expect(Number.isFinite(last.cash)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  }, 300000);
});
