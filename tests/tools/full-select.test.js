import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fullTests, reach, select } from '../../scripts/tools/full-select.mjs';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

const SCRIPT = resolve(__dirname, '../../scripts/tools/full-select.mjs');
let root;
const put = (rel, text = '') => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

// A small tree: one test imports the sim, one spawns a script that reads data, one globs a directory,
// one names test files only as a list.
beforeAll(() => {
  root = makeTemp('full-select-');
  put('src/sim/a.js', "import { b } from './b.js';\nexport const a = b;\n");
  put('src/sim/b.js', 'export const b = 1;\n');
  put('src/render/r.js', 'export const r = 1;\n');
  put('src/data/table.js', 'export const table = [];\n');
  put('src/data/cards/one.js', 'export default 1;\n');
  put('scripts/run.mjs', "import { table } from '../src/data/table.js';\nconsole.log(table);\n");
  put('scripts/order.mjs', "export const LIST = ['tests/sim/imports.full.test.js', 'tests/tools/spawns.full.test.js'];\n");
  put('tests/sim/imports.full.test.js', "import { a } from '../../src/sim/a.js';\n");
  put('tests/tools/spawns.full.test.js', "import { spawnSync } from 'node:child_process';\nspawnSync(process.execPath, ['scripts/run.mjs']);\n");
  put('tests/tools/globs.full.test.js', "const all = import.meta.glob('../../src/data/cards/*.js');\n");
  put('tests/tools/lists.full.test.js', "import { LIST } from '../../scripts/order.mjs';\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const picked = (...changed) => select(changed, { root }).picked.map((t) => t.replace(/^tests\/|\.full\.test\.js$/g, ''));

describe('full-select', () => {
  it('finds the full tests and what each reaches through imports, spawned scripts and globs', () => {
    expect(fullTests(root)).toEqual(['tests/sim/imports.full.test.js', 'tests/tools/globs.full.test.js', 'tests/tools/lists.full.test.js', 'tests/tools/spawns.full.test.js']);
    expect([...reach('tests/sim/imports.full.test.js', root).files].sort()).toEqual(['src/sim/a.js', 'src/sim/b.js', 'tests/sim/imports.full.test.js']);
    expect(reach('tests/tools/spawns.full.test.js', root).files.has('src/data/table.js')).toBe(true);
    expect([...reach('tests/tools/globs.full.test.js', root).dirs]).toEqual(['src/data/cards']);
  });

  it('selects the tests a change reaches, and a test named only in a list is not reached', () => {
    expect(picked('src/sim/b.js')).toEqual(['sim/imports']);
    expect(picked('src/data/table.js')).toEqual(['tools/spawns']);
    expect(picked('src/data/cards/two.js')).toEqual(['tools/globs']);
    expect(picked('tests/tools/spawns.full.test.js')).toEqual(['tools/spawns']);
    expect(picked('scripts/order.mjs')).toEqual(['tools/lists']);
    expect(picked('src/render/r.js', 'docs/x.md', 'public/models/m.glb')).toEqual([]);
  });

  it('selects every test for the config, the packages, or data under the sim paths that no test names', () => {
    const all = ['sim/imports', 'tools/globs', 'tools/lists', 'tools/spawns'];
    for (const f of ['vite.config.js', 'package.json', 'package-lock.json', 'src/data/new.json', 'tests/sim/fixture.json']) expect(picked(f), f).toEqual(all);
    expect(picked('src/render/tex.json')).toEqual([]);
  });

  it('says why: the way from the changed file back to the test', () => {
    const { why } = select(['src/data/table.js', 'src/data/cards/two.js'], { root });
    expect(why['tests/tools/spawns.full.test.js']).toBe('src/data/table.js <- scripts/run.mjs <- tests/tools/spawns.full.test.js');
    expect(why['tests/tools/globs.full.test.js']).toBe('src/data/cards/two.js <- src/data/cards/ (directory) <- tests/tools/globs.full.test.js');
  });

  // The engine's fetch and the model loader build asset paths at run time, so no literal names them.
  it('counts the assets the engine and the model loader read by run-time path, on this repository', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--why', '--files', 'public/models/chibi_rig.glb'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('tests/tools/studio-clip.full.test.js');
    expect(r.stdout).toContain('tests/tools/era-checks.full.test.js');
    expect(r.stderr).toMatch(/public\/models\/chibi_rig\.glb <- public\/models\/ \(directory\) <- src\/render\/models\.js <- /);
    const sound = spawnSync(process.execPath, [SCRIPT, '--files', 'public/audio/new.ogg'], { encoding: 'utf8' }).stdout;
    expect(sound).toContain('tests/tools/studio-clip.full.test.js');
    expect(sound).not.toContain('tests/sim/');
  });

  it('runs as a command on this repository, and refuses bad arguments', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--why', '--files', 'src/sim/rng.js'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('tests/sim/full-runs.full.test.js');
    expect(r.stderr).toMatch(/full-runs\.full\.test\.js: src\/sim\/rng\.js <- /);
    expect(spawnSync(process.execPath, [SCRIPT, '--files', 'docs/toolkit.md'], { encoding: 'utf8' }).stdout).toBe('');
    expect(spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync(process.execPath, [SCRIPT, '--base', 'no-such-ref'], { encoding: 'utf8' }).status).toBe(2);
  });
});
