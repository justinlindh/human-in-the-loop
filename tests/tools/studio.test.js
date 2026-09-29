import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const run = (script) => spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio', script)], { encoding: 'utf8', timeout: 240000 });

describe('studio engine', () => {
  it('its verification checks pass', () => {
    const r = run('verify.mjs');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('"passed":7');
  }, 260000);

  it('its planted geometry controls pass', () => {
    const r = run('controls.mjs');
    expect(r.status, r.stdout + r.stderr).toBe(0);
  }, 260000);
});
