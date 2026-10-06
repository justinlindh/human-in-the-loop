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

describe('balance.js --set', () => {
  const run = (...set) => spawnSync(process.execPath, ['scripts/balance.js', '--bots', 'automateAll', '--seeds', '1', '--jobs', '1', ...set.flatMap((s) => ['--set', s])],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 });

  it('turns a switch on or off with true or false, and refuses a switch value for a number or a number for a switch', () => {
    expect(run('aiInterviews.enabled=true').status).toBe(0);
    const wrong = run('aiInterviews.feeMult=true');
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('not a switch in B');
    const number = run('aiInterviews.enabled=1');
    expect(number.status).toBe(2);
    expect(number.stderr).toContain('not a number in B');
  }, 120000);
});
