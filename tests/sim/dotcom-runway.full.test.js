import { describe, it, expect } from 'vitest';
import { runBot, BOTS } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';

const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
// Runs out of 200 that must reach the bust and the recovery. recklessHumans hires past its means by
// design, and the early chapters' market stays at its 2019 size, so it gets a lower floor.
const floors = { recklessHumans: { bust: 165, recovery: 150 } };

describe('dot-com founding runway', () => {
  it.each(Object.keys(BOTS))('%s can launch and reach the bust and recovery', (bot) => {
    const runs = seeds.map((seed) => runBot(bot, seed, B.dotcom.weeks + 1, { founding: { startEra: 'dotcom' } }));
    const floor = floors[bot] ?? { bust: 180, recovery: 170 };
    expect(runs.filter((r) => r.firstLaunch !== null).length).toBeGreaterThanOrEqual(190);
    expect(runs.filter((r) => r.weeks > B.dotcom.bustWeek).length).toBeGreaterThanOrEqual(floor.bust);
    expect(runs.filter((r) => r.weeks > B.dotcom.weeks).length).toBeGreaterThanOrEqual(floor.recovery);
    for (const r of runs) if (r.weeks > 104) {
      expect(r.state.flags.y2k, `${bot} seed ${r.state.seed}`).toMatchObject({ rolloverWeek: 103, stage: 'after' });
    }
  }, 300000);
});
