import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const SHEET = resolve(__dirname, '../../scripts/tools/media-sheet.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'media-sheet-test-'));
const dir = join(tmp, 'out');
const run = (...args) => spawnAsync(process.execPath, [SHEET, ...args], { timeout: 240000 });
const size = (f) => spawnSync('magick', ['identify', '-format', '%w %h', f], { encoding: 'utf8' }).stdout.trim().split(' ').map(Number);
const ff = (...a) => spawnSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...a], { encoding: 'utf8' });

beforeAll(() => {
  mkdirSync(join(dir, 'sub'), { recursive: true });
  mkdirSync(join(dir, '.publish'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-t', '2', join(dir, 'a.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-t', '2', join(dir, 'sub', 'b.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360', '-frames:v', '1', join(dir, 's1.webp'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360', '-frames:v', '1', join(dir, 's2.png'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=64x36', '-frames:v', '1', join(dir, '.publish', 'hidden.png'));
}, 120000);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe.concurrent('media-sheet', () => {
  it('makes one sheet of a folder: a stills row and a row per clip, hidden folders left out, clips of different sizes stacked', async () => {
    const out = join(tmp, 'sheet.png');
    const r = await run(out, dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe(out);
    const [w, h] = size(out);
    // Three rows (stills, a.mp4, sub/b.mp4), each a 16:9 cell row under a title, at the sheet width.
    expect(w).toBeGreaterThan(1000);
    expect(w).toBeLessThanOrEqual(1600);
    expect(h).toBeGreaterThan(3 * 150);
    expect(readdirSync(tmp)).not.toContain('media-sheet');
  }, 250000);

  it('takes files, honours --count, and crops', async () => {
    const out = join(tmp, 'two.png');
    const r = await run(out, join(dir, 'a.mp4'), '--count', '3', '--crop', '0,0,320,180');
    expect(r.status, r.stderr).toBe(0);
    const [w] = size(out);
    expect(w).toBeGreaterThan(500);
  }, 250000);

  it('refuses bad input plainly', async () => {
    const none = await run(join(tmp, 'x.png'));
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('at least one input');
    const missing = await run(join(tmp, 'x.png'), join(tmp, 'nope'));
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('no such file or directory');
    const jpg = await run(join(tmp, 'x.jpg'), dir);
    expect(jpg.status).toBe(2);
    expect(jpg.stderr).toContain('must be a .png');
    const bad = await run(join(tmp, 'x.png'), dir, '--count', '0');
    expect(bad.status).toBe(2);
    const empty = mkdtempSync(join(tmp, 'empty-'));
    const nothing = await run(join(tmp, 'x.png'), empty);
    expect(nothing.status).toBe(1);
    expect(nothing.stderr).toContain('no stills or clips');
  }, 250000);
});
