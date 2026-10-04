import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LongestFirst, DURATIONS, fromReport, listSource } from '../../scripts/tools/test-order.mjs';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

const SCRIPT = resolve(__dirname, '../../scripts/tools/test-order.mjs');
const root = '/repo';
const spec = (path) => ({ moduleId: `${root}/${path}`, project: { name: '', config: { sequence: { groupOrder: 0 }, isolate: true } } });
// No duration cache, as on a fresh tree.
const ctx = { config: { root, shard: null }, cache: { getFileTestResults: () => undefined, getFileStats: () => undefined } };

describe('test-order', () => {
  it('starts listed files longest first, then the rest in vitest\'s own order', async () => {
    const files = [spec('tests/a.test.js'), spec('tests/sim/full-runs.test.js'), spec('tests/b.test.js'), spec('tests/sim/names.test.js')];
    const order = (await new LongestFirst(ctx).sort(files)).map((f) => f.moduleId.slice(root.length + 1));
    expect(order.slice(0, 2)).toEqual(['tests/sim/full-runs.test.js', 'tests/sim/names.test.js']);
    expect(order.slice(2).sort()).toEqual(['tests/a.test.js', 'tests/b.test.js']);
    expect(DURATIONS['tests/sim/full-runs.test.js']).toBeGreaterThan(DURATIONS['tests/sim/names.test.js']);
  });

  it('writes the list longest first and leaves out files under a second', () => {
    expect(listSource({ 'b.test.js': 2, 'a.test.js': 5, 'c.test.js': 0.4 })).toBe("export const DURATIONS = {\n  'a.test.js': 5,\n  'b.test.js': 2,\n};\n");
    expect(fromReport({ testResults: [{ name: '/r/tests/x.test.js', startTime: 1000, endTime: 3460 }, { name: '/r/tests/y.test.js' }] }, '/r')).toEqual({ 'tests/x.test.js': 2.5 });
  });

  it('--update --from merges a report into its own list, drops deleted files, and refuses bad input', () => {
    const dir = makeTemp('test-order-');
    try {
      mkdirSync(join(dir, 'scripts/tools'), { recursive: true });
      mkdirSync(join(dir, 'tests/sim'), { recursive: true });
      const copy = join(dir, 'scripts/tools/test-order.mjs');
      copyFileSync(SCRIPT, copy);
      copyFileSync(resolve(__dirname, '../../scripts/tools/tmp.mjs'), join(dir, 'scripts/tools/tmp.mjs'));
      // Only these exist in the copy's tree: every other listed file counts as deleted.
      for (const f of ['tests/sim/full-runs.test.js', 'tests/new.test.js']) writeFileSync(join(dir, f), '');
      const report = join(dir, 'report.json');
      writeFileSync(report, JSON.stringify({ testResults: [{ name: join(dir, 'tests/new.test.js'), startTime: 0, endTime: 4000 }] }));
      const r = spawnSync(process.execPath, [copy, '--update', '--from', report], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('1 files measured, 2 listed');
      const body = readFileSync(copy, 'utf8').match(/\/\/ BEGIN DURATIONS\n([\s\S]*?)\/\/ END DURATIONS/)[1];
      expect(body).toBe(`export const DURATIONS = {\n  'tests/sim/full-runs.test.js': ${DURATIONS['tests/sim/full-runs.test.js']},\n  'tests/new.test.js': 4,\n};\n`);
      expect(spawnSync(process.execPath, [copy], { encoding: 'utf8' }).status).toBe(2);
      expect(spawnSync(process.execPath, [copy, '--update', '--from', join(dir, 'missing.json')], { encoding: 'utf8' }).status).toBe(2);
      writeFileSync(report, JSON.stringify({ testResults: [] }));
      expect(spawnSync(process.execPath, [copy, '--update', '--from', report], { encoding: 'utf8' }).status).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
