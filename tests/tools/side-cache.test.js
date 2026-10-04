import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemp } from '../../scripts/tools/tmp.mjs';
import { cacheDir, readSide, writeSide } from '../../scripts/events/side-cache.js';

// The stored bot runs shared by pair.js (side a) and any tool that reads a base's runs by sim content.
let dir;
const saved = {};
beforeEach(() => {
  for (const k of ['HITL_PAIR_CACHE_DIR', 'HITL_NO_CHECK_CACHE']) saved[k] = process.env[k];
  dir = makeTemp('side-cache-test-');
  process.env.HITL_PAIR_CACHE_DIR = dir;
  delete process.env.HITL_NO_CHECK_CACHE;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  rmSync(dir, { recursive: true, force: true });
});

describe('side-cache', () => {
  it('HITL_PAIR_CACHE_DIR moves the directory', () => {
    expect(cacheDir()).toBe(dir);
  });

  it('reads back what it wrote, and null for a key it never wrote', () => {
    writeSide('k1', { 'balanced:1': { score: 3 } });
    expect(readSide('k1')).toEqual({ 'balanced:1': { score: 3 } });
    expect(readSide('nope')).toBeNull();
  });

  it('returns null for a damaged entry', () => {
    writeFileSync(join(dir, 'bad.json'), '{"half');
    expect(readSide('bad')).toBeNull();
  });

  it('HITL_NO_CHECK_CACHE=1 reads and writes nothing', () => {
    writeSide('k2', { a: 1 });
    process.env.HITL_NO_CHECK_CACHE = '1';
    expect(readSide('k2')).toBeNull();
    writeSide('k3', { a: 1 });
    expect(existsSync(join(dir, 'k3.json'))).toBe(false);
  });

  it('removes entries older than 14 days when it writes', () => {
    writeSide('old', { a: 1 });
    const t = (Date.now() - 15 * 864e5) / 1000;
    utimesSync(join(dir, 'old.json'), t, t);
    writeSide('new', { a: 2 });
    expect(readdirSync(dir).sort()).toEqual(['new.json']);
  });
});
