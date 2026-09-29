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
      expect(got.every((x) => x.e.priority === true)).toBe(true);
      expect(got.at(-1).at).toBeLessThan(5 * speed + 10 * speed + 30);
    });
    it(`survive a full ordinary queue at ${speed}x`, () => {
      expect(run(speed, { flood: true })).toHaveLength(3);
    });
  }
});

describe('reply order', () => {
  it('a reply to the player\'s post goes before older priority posts already waiting', () => {
    const q = createYakPacer();
    q.enqueue([chat('mine', { fromId: 'founder' })], { urgentIds: new Set(['mine']), gameTime: 0 });
    q.enqueue(Array.from({ length: 4 }, (_, k) => chat(`w${k}`, { channel: 'wins', text: 'Shipped' })), { gameTime: 1 });
    q.enqueue([chat('r1', { replyTo: 'mine', text: 'Nice' })], { gameTime: 2 });
    let out = [];
    for (let i = 0; i < 400 && !out.length; i++) out = q.step(0.1, true, { gameTime: 3 + i * 0.1 });
    expect(out[0].id).toBe('r1');
  });
});
