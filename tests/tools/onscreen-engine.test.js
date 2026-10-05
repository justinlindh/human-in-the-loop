import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const ONSCREEN = resolve(__dirname, '../../blender/checks/onscreen.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'onscreen-engine-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => spawnAsync(process.execPath, [ONSCREEN, ...args], { timeout: 240000 });

// Each case runs its own processes, so the cases overlap.
describe.concurrent('onscreen --no-panels (studio engine)', () => {
  it('lists the people on screen and the camera with no panels, and says it ran on the engine', async () => {
    const json = join(tmp, 'mock.json');
    const r = await run('--no-panels', '--mock', 'floor', '--frames', '0,15', '--json', json);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('studio engine, no panels');
    const frames = JSON.parse(readFileSync(json, 'utf8'));
    expect(frames.map((f) => f.frame)).toEqual([0, 15]);
    expect(frames[0].panels).toEqual([]);
    expect(frames[0].title).toBe(false);
    expect(frames[0].clock).toMatchObject({ speed: null, frozen: null, paused: true });
    expect(frames[0].people.length).toBeGreaterThan(0);
    const [x, y, w, h] = frames[0].people[0].rect;
    expect(x + w).toBeGreaterThan(0);
    expect(y + h).toBeGreaterThan(0);
    expect(frames[0].camera.zoom).toBeGreaterThan(0);
  }, 250000);

  it('refuses --speed, which needs the game loop, and reports a missing snapshot plainly', async () => {
    const speed = await run('--no-panels', '--speed', '1');
    expect(speed.status).toBe(2);
    expect(speed.stderr).toContain('--speed needs the game loop');
    const bad = await run('--no-panels', '--snapshot', join(tmp, 'no-such-snapshot.json.gz'));
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('no snapshot at');
  }, 250000);
});
