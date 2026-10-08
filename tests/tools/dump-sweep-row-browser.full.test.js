import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const DUMP = resolve(__dirname, '../../blender/checks/dump.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-sweep-row-browser-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const report = join(tmp, 'report.json');
writeFileSync(report, JSON.stringify({ mode: 'fast', violations: [] }));
const read = (dir) => JSON.parse(readFileSync(join(dir, 'dump.json'), 'utf8'));

// The same sweep window, dumped on the engine and in a browser: the same office and the same people.
describe('dump.mjs --sweep-row --browser', () => {
  it('dumps the window in a browser page, as the engine does', async () => {
    const [b, e] = [join(tmp, 'b'), join(tmp, 'e')];
    const args = ['--sweep-row', report, 'seed:1:w0', '--frames', '0,30'];
    const [rb, re] = await Promise.all([spawnAsync(process.execPath, [DUMP, '--out', b, ...args, '--browser'], { timeout: 300000 }), spawnAsync(process.execPath, [DUMP, '--out', e, ...args], { timeout: 300000 })]);
    expect(rb.status, rb.stderr).toBe(0);
    expect(re.status, re.stderr).toBe(0);
    expect(rb.stdout).toMatch(/-> .*dump\.json \(browser, /);
    const [db, de] = [read(b), read(e)];
    expect(db.scene).toMatchObject({ sweepRow: 'seed:1:w0', engine: 'browser' });
    expect(de.scene.engine).toBe('studio');
    const ids = (d) => d.frames[0].people.map((p) => p.id).sort();
    expect(ids(db).length).toBeGreaterThan(0);
    expect(ids(db)).toEqual(ids(de));
    expect(db.frames[0].items.map((i) => i.id).sort()).toEqual(de.frames[0].items.map((i) => i.id).sort());
  }, 320000);

  // A page that logged an error may have stopped part way: no dump.json (an old one goes), exit 1, unless --page-errors-ok.
  it('fails a browser dump whose page logged an error, unless --page-errors-ok', async () => {
    const out = join(tmp, 'err');
    const args = ['--out', out, '--mock', 'floor', '--browser', '--patch-js', 'console.error("dump-test boom")'];
    const ok = await spawnAsync(process.execPath, [DUMP, ...args, '--page-errors-ok'], { timeout: 300000 });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stderr).toContain('dump: warning: 1 page error(s): dump-test boom (kept going: --page-errors-ok)');
    expect(read(out).frames.length).toBe(1);
    const bad = await spawnAsync(process.execPath, [DUMP, ...args], { timeout: 300000 });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('dump: 1 page error(s): dump-test boom; no dump.json written');
    expect(() => read(out)).toThrow();
  }, 620000);

  it('refuses --images', async () => {
    const r = await spawnAsync(process.execPath, [DUMP, '--out', join(tmp, 'i'), '--sweep-row', report, 'seed:1:w0', '--images'], { timeout: 30000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--sweep-row writes no PNGs');
  });
});
