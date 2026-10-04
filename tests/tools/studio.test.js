import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnAsync } from './spawn-async.js';

const run = (script) => spawnAsync(process.execPath, [resolve(__dirname, '../../scripts/studio', script)], { timeout: 240000 });

// The two scripts are independent, so they run side by side.
describe.concurrent('studio engine', () => {
  it('its verification checks pass', async () => {
    const r = await run('verify.mjs');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('"passed":7');
  }, 260000);

  it('its planted geometry controls pass', async () => {
    const r = await run('controls.mjs');
    expect(r.status, r.stdout + r.stderr).toBe(0);
  }, 260000);
});
