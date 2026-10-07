import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const DUMP = resolve(__dirname, '../../blender/checks/dump.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-sweep-row-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const report = join(tmp, 'report.json');
writeFileSync(report, JSON.stringify({ mode: 'fast', violations: [{ check: 'person', key: 'person|person|person', state: 'seed:1:w0', states: ['seed:1:w0'], detail: 's1 (walking) in s2 (idle)' }] }));
const run = (...a) => spawnSync(process.execPath, [DUMP, '--out', join(tmp, 'out'), ...a], { encoding: 'utf8' });

describe('dump.mjs --sweep-row', () => {
  it('loads the window the report names, by state or by violation key, and checks a person is there', () => {
    const r = run('--sweep-row', report, 'seed:1:w0', 's1');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('the scene as the window starts');
    expect(r.stdout).toContain("the report's rows in it: s1 (walking) in s2 (idle)");
    expect(r.stdout).toContain('s1 is in the scene at (');
    const d = JSON.parse(readFileSync(join(tmp, 'out/dump.json'), 'utf8'));
    expect(d.scene.sweepRow).toBe('seed:1:w0');
    expect(d.frames[0].people.length).toBeGreaterThan(0);
    expect(run('--sweep-row', report, 'person|person|person').status).toBe(0);
  });
  it('exits 1 when the named person is not in the scene', () => {
    const r = run('--sweep-row', report, 'seed:1:w0', 's99999');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('s99999 is not in the scene');
  });
  it('exits 2 for a missing key, an unknown state, a missing report, and --images', () => {
    expect(run('--sweep-row', report).status).toBe(2);
    expect(run('--sweep-row', report, 'seed:1:w7x').status).toBe(2);
    const m = run('--sweep-row', join(tmp, 'none.json'), 'seed:1:w0');
    expect(m.status).toBe(2);
    expect(m.stderr).toContain('cannot read the report');
    expect(run('--sweep-row', report, 'seed:1:w0', '--images').status).toBe(2);
  });
  it('exits 1 for a window the replay never reaches', () => {
    const r = run('--sweep-row', report, 'seed:1:w7');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('without a window at week 7');
  });
});
