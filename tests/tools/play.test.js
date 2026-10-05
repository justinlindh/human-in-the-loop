import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnAsync } from './spawn-async.js';

const PLAY = resolve('blender/checks/play.mjs');
const play = (...args) => spawnAsync(process.execPath, [PLAY, ...args], { timeout: 60000 });

// These refuse before any browser or render lock is taken.
describe.concurrent('play.mjs argument checks', () => {
  it('needs a snapshot or a moment', async () => {
    const r = await play();
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--snapshot <path> or --moment/);
  });

  it('refuses a snapshot path that does not exist', async () => {
    const r = await play('--snapshot', '/nonexistent/snap.json.gz');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no snapshot at/);
  });

  it('refuses a stop predicate that is not JS', async () => {
    const r = await play('--snapshot', resolve('package.json'), '--until', 'S.week ===');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--until is not a JS expression/);
  });

  it('refuses a log expression that is not JS', async () => {
    const r = await play('--snapshot', resolve('package.json'), '--log-js', '{ a: ');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--log-js is not a JS expression/);
  });
});
