import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { play } from '../../scripts/events/play.js';
import { simHash } from '../../scripts/events/lib.js';
import { referencePlay } from './event-index-reference.js';
import { compareSnapshots, run, workspace } from './event-index-fixture.js';

const { directory, cleanup } = workspace();
afterAll(cleanup);

describe('event index full replay parity', () => {
  it('replays all bots and a long game exactly, including pre-tick and era snapshots', async () => {
    const a = directory('reference'), b = directory('replay');
    mkdirSync(join(a, 'snapshots')); mkdirSync(join(b, 'snapshots'));
    const rows = [];
    for (const bot of ['balanced', 'sensible', 'allHumans', 'automateAll', 'recklessHumans', 'squads']) {
      const args = { seed: 7, bot, weeks: bot === 'balanced' ? 1040 : 120 };
      const expected = await referencePlay({ ...args, dir: a });
      const actual = play({ ...args, dir: b });
      expect(JSON.stringify(actual.rows)).toBe(JSON.stringify(expected));
      rows.push(...actual.rows);
    }
    expect(rows.some((r) => r.preTick)).toBe(true);
    expect(rows.some((r) => r.type === 'era' && r.snapshot)).toBe(true);
    expect(compareSnapshots(a, b).length).toBeGreaterThan(10);
  }, 120000);

  it('writes identical index and snapshot bytes with one or several persistent workers', () => {
    const a = directory('serial'), b = directory('parallel');
    const args = ['--seeds', '1-3', '--bots', 'balanced,sensible', '--weeks', '80'];
    for (const [cache, jobs] of [[a, '1'], [b, '3']]) {
      const r = run(cache, [...args, '--jobs', jobs]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    }
    const hash = simHash();
    expect(readFileSync(join(a, hash, 'events.jsonl.gz')).equals(readFileSync(join(b, hash, 'events.jsonl.gz')))).toBe(true);
    compareSnapshots(join(a, hash), join(b, hash));
  }, 120000);
});
