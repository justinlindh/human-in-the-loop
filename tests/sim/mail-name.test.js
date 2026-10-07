import { describe, it, expect, afterEach } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';

const keep = B.pacing.letterMail;
afterEach(() => { B.pacing.letterMail = keep; });

// The company's name is the player's to choose; it never changes which mail arrives or how a game plays.
describe('issue #1630: the company name never changes the game', () => {
  it.each([[true, 7, 'allHumans'], [false, 1, 'allHumans'], [false, 5, 'allHumans'], [false, 3, 'balanced']])(
    'letterMail %s, seed %i, %s: the same mail and the same cash whatever the company is called', (letters, seed, bot) => {
      B.pacing.letterMail = letters;
      const play = (companyName) => {
        const r = runBot(bot, seed, 200, companyName ? { founding: { companyName } } : {});
        return { cash: r.state.cash, mail: r.state.mail.map((m) => m.kind) };
      };
      const base = play(null);
      for (const name of ['Loopworks', 'Cloud Nine Systems', 'Smartphone Labs']) expect(play(name), name).toEqual(base);
    }, 120000);
});
