import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

// `balance.js --baseline main` plays origin/main's sim once per content key, caches it, and compares.
const ROOT = join(import.meta.dirname, '../..');
let cache;
const run = (...args) => execFileSync(process.execPath, ['scripts/balance.js', '--bots', 'automateAll', ...args, '--baseline', 'main'], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, HITL_BALANCE_CACHE_DIR: cache }, stdio: ['ignore', 'pipe', 'pipe'],
});

describe('balance.js --baseline main', () => {
  beforeAll(() => { cache = mkdtempSync(join(makeTemp('balance-cache-test-'), 'c')); });
  afterAll(() => rmSync(join(cache, '..'), { recursive: true, force: true }));

  it('plays origin/main the first time, then reads it from the cache', () => {
    const first = run('--seeds', '2');
    expect(first).toMatch(/baseline: played origin\/main/);
    expect(first).toMatch(/\| automateAll \|/);
    expect(readdirSync(cache).filter((f) => f.endsWith('.json'))).toHaveLength(1);
    const again = run('--seeds', '2');
    expect(again).toMatch(/baseline: origin\/main read from the cache/);
    expect(again).toMatch(/\| automateAll \|/);
  }, 300000);

  it('plays again when the seeds change', () => {
    expect(run('--seeds', '3')).toMatch(/baseline: played origin\/main/);
    expect(readdirSync(cache).filter((f) => f.endsWith('.json'))).toHaveLength(2);
  }, 300000);
});
