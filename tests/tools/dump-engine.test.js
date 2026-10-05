import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const DUMP = resolve(__dirname, '../../blender/checks/dump.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-engine-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const run = (...args) => spawnAsync(process.execPath, [DUMP, ...args], { timeout: 240000 });
const read = (dir) => JSON.parse(readFileSync(join(dir, 'dump.json'), 'utf8'));

// Each case runs its own processes, so the cases overlap.
describe.concurrent('dump on the studio engine', () => {
  it('writes dump.json without PNGs when no images are asked for', async () => {
    const out = join(tmp, 'mock');
    const r = await run('--out', out, '--mock', 'floor', '--frames', '0,15');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('studio engine');
    expect(readdirSync(out)).toEqual(['dump.json']);
    const d = read(out);
    expect(d.frames.map((f) => f.frame)).toEqual([0, 15]);
    const p = d.frames[0].people[0];
    expect(p.screen).toHaveLength(4);
    // Screen boxes are canvas pixels of the 1280x800 viewport, not the engine's unsized canvas.
    expect(p.screen[0]).toBeGreaterThan(1);
    expect(p.screen[0] + p.screen[2]).toBeLessThanOrEqual(1280);
    expect(p.screen[1] + p.screen[3]).toBeLessThanOrEqual(800);
  }, 250000);

  it('plays a seeded game to the week and measures every camera turn, the same each run', async () => {
    const a = join(tmp, 'a'), b = join(tmp, 'b');
    const args = ['--seed', '3', '--week', '4', '--frames', '0,30', '--views', '0,1,2,3'];
    const [ra, rb] = await Promise.all([run('--out', a, ...args), run('--out', b, ...args)]);
    expect(ra.status, ra.stderr).toBe(0);
    expect(rb.status, rb.stderr).toBe(0);
    const d = read(a);
    expect(d.frames[0].people.length).toBeGreaterThan(0);
    expect(d.frames[0].people[0].views.map((v) => v.view)).toEqual([0, 1, 2, 3]);
    expect(read(b)).toEqual(d);
  }, 250000);

  it('runs the patch and the trace on the engine', async () => {
    const out = join(tmp, 'patch');
    const r = await run('--out', out, '--mock', 'floor', '--frames', '0', '--trace', '--patch-js', 'globalThis.__patched = S.week');
    expect(r.status, r.stderr).toBe(0);
    expect(read(out).frames[0].trace).toBeInstanceOf(Array);
  }, 250000);

  it('refuses a missing --out and reports a missing snapshot plainly', async () => {
    const none = await run('--mock', 'floor');
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('--out is required');
    const bad = await run('--out', join(tmp, 'bad'), '--snapshot', join(tmp, 'no-such-snapshot.json.gz'));
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('no snapshot at');
  }, 250000);
});
