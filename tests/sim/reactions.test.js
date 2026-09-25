import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { makeCtx } from '../../src/sim/registry.js';
import { emitChat } from '../../src/sim/chat.js';
import { B } from '../../src/sim/balance.js';
import { game } from './helpers.js';

const total = (r) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);

describe("issue #609: reactions scale with a post's weight", () => {
  it('routine chatter mostly gets none, big posts get more, replies rarely any, and pile-ons stay rare', () => {
    const routine = [], big = [], replies = [];
    runBot('balanced', 3, 600, { onWeek: (s, ev) => {
      for (const e of ev) {
        if (e.type !== 'chat' || e.reactions?.no_at_channel) continue;
        if (e.replyTo) replies.push(total(e.reactions));
        else if (e.channel === 'wins' || e.channel === 'incidents') big.push(total(e.reactions));
        else routine.push(total(e.reactions));
      }
    } });
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const none = (xs) => xs.filter((n) => n === 0).length / xs.length;
    expect(routine.length).toBeGreaterThan(200);
    expect(none(routine)).toBeGreaterThan(0.55);
    expect(routine.filter((n) => n > 0 && n <= 2).length + routine.filter((n) => n === 0).length).toBeGreaterThan(routine.length * 0.97);
    expect(avg(big)).toBeGreaterThan(2 * avg(routine));
    expect(none(replies)).toBeGreaterThan(0.8);
    const piles = routine.filter((n) => n >= B.reactions.pileOnMin).length;
    expect(piles / routine.length).toBeLessThan(0.04);
  });

  it("reactions come from their own stream, so posting never moves the game's random stream", () => {
    const s = game(4);
    const rng = s.rng.s;
    const ctx = makeCtx(s);
    for (let i = 0; i < 20; i++) emitChat(ctx, { channel: 'general', from: '@officebot', text: 'hello' });
    emitChat(ctx, { channel: 'wins', from: '@launchbot', text: 'shipped', kind: 'win' });
    expect(s.rng.s).toBe(rng);
  });
});
