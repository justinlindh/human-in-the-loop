import { it, expect } from 'vitest';
import { simulatePacing } from '../scripts/pace.js';

it('reports spotlight-only added time and skips that time at top speed', () => {
  const options = { seed: 1, weeks: 160, player: 'eager', frame: 0.1 };
  const normal = simulatePacing(options).metrics;
  const fast = simulatePacing({ ...options, speed: 4 }).metrics;
  expect(normal.spotlight.count).toBeGreaterThan(0);
  expect(normal.spotlight.addedSeconds).toBeGreaterThan(0);
  expect(normal.spotlight.skipped).toBe(0);
  expect(fast.spotlight.skipped).toBe(fast.spotlight.count);
  expect(fast.spotlight.addedSeconds).toBe(0);
  expect(fast.weeks).toBe(normal.weeks);
});
