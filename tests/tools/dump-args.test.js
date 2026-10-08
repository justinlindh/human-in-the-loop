import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const DUMP = resolve(__dirname, '../../blender/checks/dump.mjs');
const QUERY = resolve(__dirname, '../../blender/checks/dump-query.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-args-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('dump.mjs --frames', () => {
  it.each(['0-270:6', '0,,30', '1.5', 'a', '-3'])('refuses %s with exit 2 before launching anything', (v) => {
    const r = spawnSync(process.execPath, [DUMP, '--out', join(tmp, 'o'), '--frames', v], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--frames wants a comma list of whole frame numbers');
  });
});

describe('dump.mjs --trace-js', () => {
  it('refuses an expression that does not parse with exit 2', () => {
    const r = spawnSync(process.execPath, [DUMP, '--out', join(tmp, 'o'), '--trace-js', '('], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--trace-js is not a JS expression');
  });
  it('writes the value per frame (a throwing expression becomes { error })', () => {
    const run = (expr, out) => spawnSync(process.execPath, [DUMP, '--mock', 'floor', '--out', join(tmp, out), '--frames', '0,30', '--trace-js', expr], { encoding: 'utf8', timeout: 120000 });
    const ok = run('S.staff.length + ":" + frame', 'ok');
    expect(ok.status, ok.stderr).toBe(0);
    const f = JSON.parse(readFileSync(join(tmp, 'ok/dump.json'), 'utf8')).frames;
    expect(f.map((x) => x.traceJs)).toEqual([expect.stringMatching(/^\d+:0$/), expect.stringMatching(/^\d+:30$/)]);
    const bad = run('nope.x', 'bad');
    expect(bad.status, bad.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(tmp, 'bad/dump.json'), 'utf8')).frames[0].traceJs.error).toContain('nope');
  }, 130000);
});

describe('dump-query on a frame without t', () => {
  it('prints t as ? instead of crashing', () => {
    const f = join(tmp, 'dump.json');
    writeFileSync(f, JSON.stringify({ frames: [{ frame: 0, people: [], items: [], props: [] }] }));
    const r = spawnSync(process.execPath, [QUERY, f, 'visible', 'nobody'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('t=?');
  });
});
