import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

const ROOT = join(import.meta.dirname, '../..');

describe('balance.js run record', () => {
  it('logs the games it played and its CPU to the timings log', () => {
    const dir = makeTemp('balance-timings-');
    const file = join(dir, 'timings.jsonl');
    try {
      const r = spawnSync(process.execPath, ['scripts/balance.js', '--bots', 'automateAll', '--seeds', '2', '--jobs', '1'],
        { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, HITL_TIMINGS: file } });
      expect(r.status).toBe(0);
      const rec = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.kind === 'run' && x.tool === 'balance');
      expect(rec.games).toBe(2);
      expect(rec.cpu_s).toBeGreaterThan(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120000);
});
