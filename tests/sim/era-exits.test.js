import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { ipoBlocker, exitMrr } from '../../src/sim/endgame.js';
import { helpers } from '../../src/sim/events.js';
import { addProduct } from './helpers.js';

// A company with the IPO's brand and office, and MRR set to exactly `mrr`.
function ready(startEra, mrr) {
  const s = createGame({ seed: 3, ...(startEra ? { startEra } : {}) });
  s.week = B.retireFromWeek; s.brand = 100; s.officeStage = s.office.stage = 2;
  addProduct(s, { mrr });
  return s;
}

describe('score shares for the founding screen', () => {
  it('keeps every era start below the Classic path', () => {
    expect(B.eraStarts.classic.scoreShare).toBe(1);
    for (const era of ['dotcom', 'web2', 'chatgbt', 'agents']) {
      expect(B.eraStarts[era].scoreShare).toBeGreaterThan(0);
      expect(B.eraStarts[era].scoreShare).toBeLessThan(1);
    }
  });
});

describe('exit bars follow the start', () => {
  it('keeps the Classic bars', () => {
    for (const s of [ready(null, 0), ready('classic', 0)]) {
      expect(exitMrr(s, B.ipoMrr)).toBe(B.ipoMrr);
      expect(exitMrr(s, B.acquisitionOfferMrr)).toBe(B.acquisitionOfferMrr);
    }
    expect(ipoBlocker(ready(null, B.ipoMrr - 1))).toMatch(/MRR/);
    expect(ipoBlocker(ready(null, B.ipoMrr))).toBe(null);
  });

  it.each(['dotcom', 'web2', 'chatgbt', 'agents'])('scales the IPO and offer bars for a %s start', (era) => {
    const mult = B.eraStarts[era].exitMrrMult;
    const ipo = Math.round(B.ipoMrr * mult);
    expect(exitMrr(ready(era, 0), B.ipoMrr)).toBe(ipo);
    expect(ipoBlocker(ready(era, ipo - 1))).toBe(`Needs $${ipo.toLocaleString('en-US')} MRR`);
    expect(ipoBlocker(ready(era, ipo))).toBe(null);
    const offer = Math.round(B.acquisitionOfferMrr * mult);
    expect(helpers(ready(era, offer - 1)).offerReady).toBe(false);
    expect(helpers(ready(era, offer)).offerReady).toBe(true);
  });
});
