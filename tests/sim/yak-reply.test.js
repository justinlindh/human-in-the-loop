import { describe, it, expect } from 'vitest';
import { createYakPacer } from '../../src/yak-pacing.js';
import { B } from '../../src/sim/balance.js';

const chat = (id, extra = {}) => ({ type: 'chat', id, channel: 'general', from: 'A', fromId: 'p1', text: 'chatter '.repeat(8), replyTo: null, ...extra });

// Runs a pacer the way main.js does: the player's post shows at once, replies and chatter queue.
function run(speed, { flood = false } = {}) {
  const q = createYakPacer();
  q.enqueue([chat('mine', { fromId: 'founder', text: 'Big news' })], { urgentIds: new Set(['mine']), gameTime: 0 });
  const dt = 0.1;
  const shown = [];
  let t = 0;
  for (let i = 0; i < 1500; i++) {
    t += dt * speed;
    if (i % 20 === 0) q.enqueue([chat(`c${i}`)], { gameTime: t });
    if (i === 50) {
      if (flood) q.enqueue(Array.from({ length: B.yakPendingLimit + 10 }, (_, k) => chat(`f${k}`)), { gameTime: t });
      q.enqueue(['r1', 'r2', 'r3'].map((id) => chat(id, { replyTo: 'mine', text: 'Nice' })), { gameTime: t });
    }
    for (const e of q.step(dt, true, { gameTime: t })) shown.push({ e, at: t });
  }
  return shown.filter((x) => x.e.replyTo === 'mine');
}

describe('replies to the player\'s own post', () => {
  for (const speed of [1, 4]) {
    it(`all show promptly at ${speed}x amid chatter`, () => {
      const got = run(speed);
      expect(got.map((x) => x.e.id).sort()).toEqual(['r1', 'r2', 'r3']);
      expect(got.at(-1).at).toBeLessThan(5 * speed + 10 * speed + 30);
    });
    it(`survive a full ordinary queue at ${speed}x`, () => {
      expect(run(speed, { flood: true })).toHaveLength(3);
    });
  }
});
