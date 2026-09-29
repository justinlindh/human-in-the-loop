import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLIP = resolve(__dirname, '../../scripts/studio/clip.mjs');
const run = (...args) => spawnSync(process.execPath, [CLIP, ...args], { encoding: 'utf8', timeout: 240000 });

describe('studio clip', () => {
  it('runs a group on the engine and prints the check names the browser run prints', () => {
    const r = run('--group', 'seats');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('CLIP ok   desks:all-seated');
    expect(r.stdout).toMatch(/CLIP ok {3}desk:f1:typing \{"handGapMin"/);
    expect(r.stdout).toMatch(/CLIP ok {3}head:s1:/);
  }, 260000);

  it('refuses a group it does not run', () => {
    const r = run('--group', 'sky');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown group sky');
  });
});
