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
  it.each(['balanced', 'sensible'])('%s reaches Web 2.0 between 1 and 15 points less often than a dot-com founding', (bot) => {
    // Pooled over 600 seeds, since one 200-seed set swings this shortfall too widely to pin it.
    const SEEDS = 600;
    let survivors = 0;
    let dotcomSurvivors = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const run = runBot(bot, seed, B.preinternet.weeks + B.dotcom.weeks + 1, { founding: { startEra: 'preinternet' } });
      const dotcom = runBot(bot, seed, B.dotcom.weeks + 1, { founding: { startEra: 'dotcom' } });
      assertFinite(run.state);
      assertFinite(dotcom.state);
      if (run.eras.web2 && !run.state.gameOver) survivors++;
      if (dotcom.eras.web2 && !dotcom.state.gameOver) dotcomSurvivors++;
    }
    // A larger payroll makes the inherited dot-com chapter harder without making it a dead end.
    const points = ((dotcomSurvivors - survivors) / SEEDS) * 100;
    expect(points).toBeGreaterThanOrEqual(1);
    expect(points).toBeLessThanOrEqual(15);
  }, 900000);
});
