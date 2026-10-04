import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'check-cache-')); process.env.HITL_CHECK_CACHE_DIR = dir; });
afterEach(() => { delete process.env.HITL_CHECK_CACHE_DIR; rmSync(dir, { recursive: true, force: true }); });

const load = () => import('../../blender/checks/cache.mjs');
const REF = 'blender/checks/golden.mjs';

describe('whole-check records keyed by the files a pass loaded', () => {
  const LOADED = ['src/render/checks.js', 'public/models/chibi.glb', 'url:https://fonts.example/f'];
  const recordFile = (name) => join(dir, 'probe', name);

  it('a recorded pass is a hit while every loaded file is unchanged, and carries the commit', async () => {
    const c = await load();
    const base = c.graphBase('probe', 'x');
    expect(c.graphPassedAt('probe', base)).toBeNull();
    c.recordGraphPass('probe', base, LOADED);
    expect(c.graphPassedAt('probe', base)).toMatch(/^[0-9a-f]{4,}$|^uncommitted$/);
  });

  it('a changed loaded file is a miss; a file the pass never loaded does not matter', async () => {
    const c = await load();
    const base = c.graphBase('probe', 'x');
    c.recordGraphPass('probe', base, LOADED);
    const file = recordFile(`graph-${base}.json`);
    const rec = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(rec.files)).toEqual(expect.arrayContaining(['src/render/checks.js']));
    expect(Object.keys(rec.files)).not.toContain('src/ui/hud.js');
    writeFileSync(file, JSON.stringify({ ...rec, files: { ...rec.files, 'src/render/checks.js': 'stale' } }));
    expect(c.graphPassedAt('probe', base)).toBeNull();
  });

  it('a different flag or check name is a different base', async () => {
    const c = await load();
    expect(c.graphBase('probe', 'a')).not.toBe(c.graphBase('probe', 'b'));
    expect(c.graphBase('probe', 'a')).not.toBe(c.graphBase('other', 'a'));
    expect(c.graphBase('probe', 'a')).toBe(c.graphBase('probe', 'a'));
  });

  it('records nothing for a run that loaded no game source, a missing file, or a null base', async () => {
    const c = await load();
    const base = c.graphBase('probe', 'x');
    c.recordGraphPass('probe', base, ['blender/checks/golden.mjs']);
    c.recordGraphPass('probe', base, ['src/render/checks.js', 'src/render/no-such-file.js']);
    c.recordGraphPass('probe', null, LOADED);
    expect(existsSync(join(dir, 'probe'))).toBe(false);
  });

  it('turns absolute paths into repo paths and drops node_modules and outside files', async () => {
    const c = await load();
    const root = process.cwd();
    expect(c.loadedFiles([`${root}/src/a.js`, `${root}/node_modules/three/x.js`, '/etc/passwd', 'src/b.js', 'url:https://h/p', null])).toEqual(['src/a.js', 'src/b.js', 'url:https://h/p']);
  });

  it("the entry script's import graph covers its checking code and the game it imports, nothing else", async () => {
    const c = await load();
    const root = process.cwd();
    const graph = c.moduleGraph(`${root}/blender/checks/stage.mjs`).map((f) => f.slice(root.length + 1));
    expect(graph).toEqual(expect.arrayContaining(['blender/checks/stage.mjs', 'blender/checks/harness.mjs', 'blender/checks/cache.mjs', 'src/render/spots.js']));
    expect(graph.some((f) => f.startsWith('src/ui/') || f.startsWith('src/audio/'))).toBe(false);
    expect(graph.some((f) => f.includes('node_modules'))).toBe(false);
    expect(c.moduleGraph(`${root}/no/such/entry.mjs`)).toEqual([]);
  });

  it('a pass records the entry graph with the reported files', async () => {
    const c = await load();
    const base = c.graphBase('probe', 'x');
    c.recordGraphPass('probe', base, ['src/render/checks.js'], `${process.cwd()}/blender/checks/standup.mjs`);
    const rec = JSON.parse(readFileSync(join(dir, 'probe', `graph-${base}.json`), 'utf8'));
    expect(Object.keys(rec.files)).toEqual(expect.arrayContaining(['src/render/checks.js', 'blender/checks/standup.mjs', 'blender/checks/harness.mjs']));
    expect(rec.lists).toEqual({});
  });

  it('HITL_NO_CHECK_CACHE turns it off', async () => {
    const c = await load();
    process.env.HITL_NO_CHECK_CACHE = '1';
    try {
      expect(c.graphBase('probe')).toBeNull();
      expect(c.graphPassedAt('probe', null)).toBeNull();
    } finally { delete process.env.HITL_NO_CHECK_CACHE; }
  });
});

describe('per-scene check records', () => {
  it('a recorded scene is up to date only for its own base key', async () => {
    const c = await load();
    c.recordScene('probe', 's', 'base1', [], REF);
    expect(c.sceneUpToDate('probe', 's', 'base1', REF)).toBe(true);
    expect(c.sceneUpToDate('probe', 's', 'base2', REF)).toBe(false);
  });

  it('a check name keeps its records apart, so identity never reads a scene record', async () => {
    const c = await load();
    c.recordScene('golden', 'char-lineup', 'b', [], REF);
    expect(c.sceneUpToDate('golden-identity', 'char-lineup', 'b', REF)).toBe(false);
  });

  it('clearScene drops a record and tolerates a missing one', async () => {
    const c = await load();
    c.recordScene('probe', 's', 'b', [], REF);
    c.clearScene('probe', 's');
    expect(c.sceneUpToDate('probe', 's', 'b', REF)).toBe(false);
    expect(() => c.clearScene('probe', 'never')).not.toThrow();
    expect(existsSync(join(dir, 'probe-scenes', 's.json'))).toBe(false);
  });

  it('a null base (cache disabled) never records or matches', async () => {
    const c = await load();
    c.recordScene('probe', 's', null, [], REF);
    expect(c.sceneUpToDate('probe', 's', null, REF)).toBe(false);
    expect(existsSync(join(dir, 'probe-scenes'))).toBe(false);
  });
});
