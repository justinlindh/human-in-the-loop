import { it, expect } from 'vitest';
import { simulatePacing } from '../scripts/pace.js';
import { B } from './sim/balance.js';

it('paces Yak chats through the Yak pacer, as the game does', () => {
  const frame = 0.1;
  const { metrics, timeline } = simulatePacing({ seed: 3, minutes: 12, frame });
  const chats = timeline.filter((e) => e.kind === 'chat');
  const queued = chats.slice(1).filter((e) => !e.urgent);
  expect(queued.length).toBeGreaterThan(20);
  expect(chats.some((e) => e.urgent)).toBe(true);
  // A queued chat waits out the Yak pacer's reading gap after whatever line came before it.
  for (let i = 1; i < chats.length; i++) {
    if (!chats[i].urgent) expect(chats[i].t - chats[i - 1].t).toBeGreaterThanOrEqual(B.yakMinGapSeconds - frame);
  }
  expect(metrics.chat.omitted).toBeGreaterThanOrEqual(0);
});
