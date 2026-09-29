import { describe, it, expect } from 'vitest';
import { replayBeat, beatList } from './trailer-beats/replay.mjs';
import { PRE_UNTIL, IN_OFFICE, CHAT_HISTORY, YAK_ONLY, CLEAN } from '../../scripts/capture-manifest.js';
import { LOAD_PIN } from '../../scripts/trailer/pins.js';

// Loading the capture manifests is slow while the rest of the suite runs alongside.
describe('trailer and landing beat replay (#1175)', { timeout: 60000 }, () => {
  it('plays a PRE_UNTIL setup through the sim, ignoring the page code around it, and stops the week before the hit', async () => {
    const setup = `(async () => { await ${PRE_UNTIL({ weeks: 60, bot: 'balanced', prep: IN_OFFICE, after: CHAT_HISTORY, hit: '(c) => c.week === 20' })}; ${YAK_ONLY}; ${CLEAN}; })()`;
    const m = await replayBeat({ id: 't', query: 'seed=3&speed=1', setup });
    expect(m.error).toBeUndefined();
    expect(m).toMatchObject({ week: 19, era: 'classic', over: false });
    expect(m.next).toHaveProperty('raised');
  });

  it('the same setup lands on the same moment every time', async () => {
    const setup = PRE_UNTIL({ weeks: 200, bot: 'balanced', hit: '(c) => !!c.pendingDecision' });
    const a = await replayBeat({ id: 'a', query: 'seed=5', setup });
    const b = await replayBeat({ id: 'b', query: 'seed=5', setup });
    expect(b).toEqual(a);
    expect(a.decision).toBe(null);
    expect(a.next.decision).toBeTruthy();
  });

  it('loads a stored trailer pin through the save', async () => {
    const m = await replayBeat({ id: 'p', query: 'seed=62', setup: LOAD_PIN('meme') });
    expect(m.error).toBeUndefined();
    expect(m.week).toBeGreaterThan(0);
  });

  it('reports a setup that throws instead of failing the run', async () => {
    const m = await replayBeat({ id: 'x', query: 'seed=1', setup: "(async () => { throw new Error('capture: nothing here'); })()" });
    expect(m).toEqual({ error: 'capture: nothing here' });
  });

  it('covers trailer, pin and landing beats with a sim setup, and none that opens at an indexed moment', async () => {
    const list = await beatList();
    const ids = list.map((i) => i.id);
    for (const prefix of ['trailer-', 'pin-', 'site-']) expect(ids.some((id) => id.startsWith(prefix)), prefix).toBe(true);
    expect(list.every((i) => i.setup && !i.moment)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
