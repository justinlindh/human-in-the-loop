import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// The seats group takes most of 20 s on the engine. Local CI's render-checks step plays it (with every
// other group) through blender/checks/clip.mjs on any change outside the docs.
const CLIP = resolve(__dirname, '../../scripts/studio/clip.mjs');

describe('studio clip, whole groups', () => {
  it('runs a group on the engine and prints the check names the browser run prints', () => {
    const r = spawnSync(process.execPath, [CLIP, '--group', 'seats'], { encoding: 'utf8', timeout: 240000 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('CLIP ok   desks:all-seated');
    expect(r.stdout).toMatch(/CLIP ok {3}desk:f1:typing \{"handGapMin"/);
    expect(r.stdout).toMatch(/CLIP ok {3}head:s1:/);
  }, 260000);
});
