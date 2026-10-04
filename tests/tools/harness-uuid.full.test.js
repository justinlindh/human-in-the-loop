import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

// Browser test: needs a render slot, so it runs with the full suite only.
describe('harness UUID streams', () => {
  it('gives no two scene materials the same UUID after the game stream is reseeded', () => {
    const r = spawnSync(process.execPath, ['tests/tools/harness-uuid-probe.mjs'], { encoding: 'utf8', timeout: 360000 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    expect(out.errors).toEqual([]);
    expect(out.total).toBeGreaterThan(10);
    expect(out.clashes).toEqual([]);
  }, 400000);
});
