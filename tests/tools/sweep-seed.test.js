import { describe, expect, it } from 'vitest';
import { seedInChild } from '../../blender/checks/sweep-seed.mjs';
import { SEED_PLAY } from '../../blender/checks/sweep-plan.js';

// An engine sweep plays each seed in a process of its own, so nothing an earlier scene left in the game's modules
// changes how it plays, and a fresh dump or replay of a window sees what the sweep saw.
describe.concurrent('a seed played in its own process', () => {
  it('returns what hostSeed returns, from another process, and hands its group to the reaper', async () => {
    const groups = [];
    const r = await seedInChild({ seed: 1, ...SEED_PLAY.fast, only: [5], known: [], worst: {} }, { reap: (g) => groups.push(g) });
    expect(r.pid).not.toBe(process.pid);
    expect(groups).toEqual([r.pid]);
    expect(r.windows.map((w) => w.state)).toEqual(['seed:1:w5']);
    expect(r.end.week).toBe(6);
    expect(Array.isArray(r.violations)).toBe(true);
  }, 120000);

  it('lists the files it loaded when the run records them', async () => {
    const before = process.env.HITL_LOAD_TRACK;
    process.env.HITL_LOAD_TRACK = '1';
    try {
      const r = await seedInChild({ seed: 1, ...SEED_PLAY.fast, weeks: 0, known: [], worst: {} });
      expect(r.loaded.some((f) => f.endsWith('/src/render/index.js'))).toBe(true);
      expect(r.loaded.some((f) => f.endsWith('/src/sim/index.js'))).toBe(true);
    } finally {
      if (before === undefined) delete process.env.HITL_LOAD_TRACK; else process.env.HITL_LOAD_TRACK = before;
    }
  }, 120000);

  it('rejects naming the seed when the child fails', async () => {
    await expect(seedInChild({ seed: 1, bot: 'no_such_bot', ...SEED_PLAY.fast, weeks: 1, known: [], worst: {} })).rejects.toThrow(/^sweep: seed 1: /);
  }, 120000);
});
