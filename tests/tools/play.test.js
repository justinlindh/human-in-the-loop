import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PLAY = resolve('blender/checks/play.mjs');
const play = (...args) => spawnSync(process.execPath, [PLAY, ...args], { encoding: 'utf8', timeout: 60000 });

// These refuse before any browser or render lock is taken.
describe('play.mjs argument checks', () => {
  it('needs a snapshot or a moment', () => {
    const r = play();
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--snapshot <path> or --moment/);
  });

  it('refuses a snapshot path that does not exist', () => {
    const r = play('--snapshot', '/nonexistent/snap.json.gz');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/no snapshot at/);
  });

  it('refuses a stop predicate that is not JS', () => {
    const r = play('--snapshot', resolve('package.json'), '--until', 'S.week ===');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--until is not a JS expression/);
  });

  it('refuses a log expression that is not JS', () => {
    const r = play('--snapshot', resolve('package.json'), '--log-js', '{ a: ');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--log-js is not a JS expression/);
  });
});
