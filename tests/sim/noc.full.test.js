import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';

describe('bots and the NOC', () => {
  it('the balanced and sensible bots buy a NOC, grow it with the office and answer the bet', () => {
    for (const bot of ['balanced', 'sensible']) {
      let bet = false;
      const r = runBot(bot, 1, undefined, { onWeek: (s) => { bet ||= !!s.ops.noc; } });
      const noc = r.state.office.placed.find((p) => p.itemId === 'noc');
      expect(noc?.level, bot).toBe(r.state.officeStage + 1);
      expect(bet, bot).toBe(true);
    }
  }, 60000);

  it('the other bots leave it alone', () => {
    const r = runBot('allHumans', 1, 400);
    expect(r.state.office.placed.some((p) => p.itemId === 'noc')).toBe(false);
  }, 60000);
});
