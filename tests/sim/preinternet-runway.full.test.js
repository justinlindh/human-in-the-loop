import { describe, it, expect } from 'vitest';
import { runBot, BOTS, assertFinite } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { FUNDING_IDS } from '../../src/data/funding.js';

describe.each(FUNDING_IDS)('pre-internet opening with %s funding', (funding) => {
  it.each(Object.keys(BOTS))('%s survives the physical chapter in most seeds unless it automates everything', (bot) => {
    let survivors = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = runBot(bot, seed, B.preinternet.weeks + 1, { founding: { startEra: 'preinternet', funding } });
      assertFinite(run.state);
      if (run.weeks > B.preinternet.weeks && !run.state.gameOver) survivors++;
    }
    if (bot !== 'automateAll') expect(survivors).toBeGreaterThan(100);
  }, 300000);
});

describe('pre-internet handoff through the dot-com chapter', () => {
  it.each(['balanced', 'sensible'])('%s reaches Web 2.0 at least as often as a dot-com founding', (bot) => {
    let survivors = 0;
    let dotcomSurvivors = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = runBot(bot, seed, B.preinternet.weeks + B.dotcom.weeks + 1, { founding: { startEra: 'preinternet' } });
      const dotcom = runBot(bot, seed, B.dotcom.weeks + 1, { founding: { startEra: 'dotcom' } });
      assertFinite(run.state);
      assertFinite(dotcom.state);
      if (run.eras.web2 && !run.state.gameOver) survivors++;
      if (dotcom.eras.web2 && !dotcom.state.gameOver) dotcomSurvivors++;
    }
    expect(survivors).toBeGreaterThanOrEqual(dotcomSurvivors);
  }, 300000);
});
