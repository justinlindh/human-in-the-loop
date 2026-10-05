import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const SWEEP = resolve(__dirname, '../../blender/checks/sweep.mjs');
let dir;
beforeAll(() => { dir = mkdtempSync(join(toolTmp(), 'sweep-cache-')); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A narrow engine run (one mock, no seeds, no screen step): a second or two, deterministic.
const run = (out, args = [], env = {}) => spawnAsync('node', [SWEEP, '--mocks', 'garage', '--seeds', 'none', '--no-screen', '--out', join(dir, out), ...args], { timeout: 120000, env: { ...process.env, HITL_CHECK_CACHE_DIR: join(dir, 'cache'), ...env } });

describe('the sweep cache', () => {
  it('skips an unchanged clean run and hands back the report the pass saved', async () => {
    const a = await run('a');
    expect(a.status, a.stderr).toBe(0);
    expect(a.stdout).not.toContain('unchanged');
    const b = await run('b');
    expect(b.status, b.stderr).toBe(0);
    expect(b.stdout).toContain('inputs unchanged');
    for (const f of ['report.json', 'report.md']) expect(readFileSync(join(dir, 'b', f), 'utf8')).toBe(readFileSync(join(dir, 'a', f), 'utf8'));
  });

  it('keys on the arguments, and a replay or HITL_NO_CHECK_CACHE=1 never skips', async () => {
    await run('a');
    const other = await run('c', ['--mocks', 'floor']);
    expect(other.stdout).not.toContain('unchanged');
    const replay = await run('d', ['--replay', join(dir, 'a', 'report.json')]);
    expect(replay.stdout).not.toContain('unchanged');
    const off = await run('e', [], { HITL_NO_CHECK_CACHE: '1' });
    expect(off.stdout).not.toContain('unchanged');
    expect(existsSync(join(dir, 'e', 'report.json'))).toBe(true);
  });
});
