import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');
const tmp = mkdtempSync(join(toolTmp(), 'scene-patch-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// --patch-js is an async body: an import it awaits has finished before the still and --report run.
describe('scene.mjs --patch-js', () => {
  it('waits for a patch that imports a module, and the page has __advance for the setup helpers', () => {
    const out = join(tmp, 'still.png');
    const patch = "const m = await import('/src/render/checks.js'); window.__patched = [typeof m.setupDeal, typeof window.__advance];";
    const r = spawnSync(process.execPath, ['blender/checks/scene.mjs', '--mock', 'floor', '--software', '--size', '320x200', '--out', out, '--patch-js', patch, '--report', 'JSON.stringify(window.__patched)'], { encoding: 'utf8', cwd: ROOT, timeout: 240000 });
    expect(r.status, r.stderr.slice(-400)).toBe(0);
    expect(r.stdout).toContain('scene: report "[\\"function\\",\\"function\\"]"');
    expect(existsSync(out)).toBe(true);
  }, 250000);

  it('dump.mjs --browser writes --trace-js values per frame', () => {
    const r = spawnSync(process.execPath, ['blender/checks/dump.mjs', '--browser', '--mock', 'floor', '--software', '--out', join(tmp, 'dump-trace'), '--frames', '0,30', '--trace-js', 'frame + ":" + S.staff.length'], { encoding: 'utf8', cwd: ROOT, timeout: 240000 });
    expect(r.status, r.stderr.slice(-400) + r.stdout.slice(-400)).toBe(0);
    const frames = JSON.parse(readFileSync(join(tmp, 'dump-trace/dump.json'), 'utf8')).frames;
    expect(frames.map((f) => f.traceJs)).toEqual([expect.stringMatching(/^0:\d+$/), expect.stringMatching(/^30:\d+$/)]);
  }, 250000);

  it('dump.mjs --browser runs the same patch', () => {
    const r = spawnSync(process.execPath, ['blender/checks/dump.mjs', '--browser', '--mock', 'floor', '--software', '--out', join(tmp, 'dump'), '--frames', '0', '--patch-js', "const m = await import('/src/render/checks.js'); if (typeof m.setupDeal !== 'function') throw new Error('no setupDeal');"], { encoding: 'utf8', cwd: ROOT, timeout: 240000 });
    expect(r.status, r.stderr.slice(-400) + r.stdout.slice(-400)).toBe(0);
  }, 250000);
});
