import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join } from 'node:path';

let dir;
beforeEach(() => { dir = mkdtempSync(join(toolTmp(), 'check-cache-')); process.env.HITL_CHECK_CACHE_DIR = dir; });
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

  it('says why on stderr when it records nothing, and stays quiet for a null base or a good record', async () => {
    const c = await load();
    const base = c.graphBase('probe', 'x');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      c.recordGraphPass('probe', base, ['blender/checks/golden.mjs']);
      c.recordGraphPass('probe', base, ['src/render/checks.js', 'src/render/no-such-file.js']);
      expect(spy.mock.calls.map((a) => a[0])).toEqual([
        'probe: cache: skipped (no game source loaded)',
        'probe: cache: skipped (a loaded file is missing (src/render/no-such-file.js))',
      ]);
      spy.mockClear();
      c.recordGraphPass('probe', null, LOADED);
      c.recordGraphPass('probe', base, LOADED);
      expect(spy).not.toHaveBeenCalled();
      // A record that cannot be written (the cache dir is a file) is named too.
      writeFileSync(join(dir, 'blocked'), 'x');
      process.env.HITL_CHECK_CACHE_DIR = join(dir, 'blocked');
      c.recordGraphPass('probe', base, LOADED);
      expect(spy.mock.calls[0][0]).toMatch(/^probe: cache: skipped \(could not write the record: /);
    } finally { spy.mockRestore(); }
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

describe('per-item records for captured media', () => {
  const ITEM = { id: 'printer', query: 'mock=floor', setup: (S) => S.week };
  const TOOLS = ['scripts/feature-media/render.mjs'];
  const LOADED = ['http://localhost:5173/src/render/checks.js', 'http://localhost:5173/models/chibi.glb', 'src/ui/simapi.js', 'https://fonts.example/f.woff2'];
  const recFile = (id) => join(dir, 'media-items', `${id}.json`);

  it('an item is up to date after a record, and stale with no record, another spec or a changed tool', async () => {
    const c = await load();
    const base = c.itemBase('media', ITEM, TOOLS);
    expect(c.itemStatus('media', 'printer', base)).toEqual({ upToDate: false, reason: 'no record' });
    expect(c.recordItem('media', 'printer', base, LOADED)).toBe(true);
    expect(c.itemStatus('media', 'printer', base)).toMatchObject({ upToDate: true, reason: null });
    // A spec function counts by its source, so editing one changes the base.
    expect(c.itemBase('media', { ...ITEM, setup: (S) => S.month }, TOOLS)).not.toBe(base);
    expect(c.itemBase('media', { ...ITEM, query: 'mock=hq' }, TOOLS)).not.toBe(base);
    expect(c.itemBase('media', ITEM, [])).not.toBe(base);
    expect(c.itemStatus('media', 'printer', c.itemBase('media', { ...ITEM, query: 'mock=hq' }, TOOLS))).toEqual({ upToDate: false, reason: 'spec or tools changed' });
  });

  it('records the repo files behind the URLs and paths, names a changed one, and a glob directory', async () => {
    const c = await load();
    const base = c.itemBase('media', ITEM, TOOLS);
    c.recordItem('media', 'printer', base, LOADED);
    const rec = JSON.parse(readFileSync(recFile('printer'), 'utf8'));
    expect(Object.keys(rec.files)).toEqual(expect.arrayContaining(['src/render/checks.js', 'public/models/chibi.glb', 'src/ui/simapi.js', 'url:https://fonts.example/f.woff2']));
    expect(Object.keys(rec.lists)).toContain('src/sim');
    writeFileSync(recFile('printer'), JSON.stringify({ ...rec, files: { ...rec.files, 'src/render/checks.js': 'stale' } }));
    expect(c.itemStatus('media', 'printer', base)).toEqual({ upToDate: false, reason: 'changed: src/render/checks.js' });
    writeFileSync(recFile('printer'), JSON.stringify({ ...rec, lists: { ...rec.lists, 'src/sim': 'stale' } }));
    expect(c.itemStatus('media', 'printer', base)).toEqual({ upToDate: false, reason: 'files added or removed under src/sim' });
  });

  it('records nothing without game source or with a missing file, clears, keeps ids apart, and is off with the cache', async () => {
    const c = await load();
    const base = c.itemBase('media', ITEM, TOOLS);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(c.recordItem('media', 'a', base, ['http://localhost:5173/models/chibi.glb'])).toBe(false);
      expect(c.recordItem('media', 'a', base, ['src/render/no-such-file.js'])).toBe(false);
      expect(spy.mock.calls.map((x) => x[0])).toEqual(['media: cache: skipped (a: no game source loaded)', 'media: cache: skipped (a: a loaded file is missing (src/render/no-such-file.js))']);
    } finally { spy.mockRestore(); }
    c.recordItem('media', 'a/b', base, LOADED);
    expect(c.itemStatus('media', 'a/b', base).upToDate).toBe(true);
    expect(c.itemStatus('media', 'a', base).reason).toBe('no record');
    c.clearItem('media', 'a/b');
    expect(c.itemStatus('media', 'a/b', base).reason).toBe('no record');
    expect(() => c.clearItem('media', 'never')).not.toThrow();
    process.env.HITL_NO_CHECK_CACHE = '1';
    try {
      expect(c.itemBase('media', ITEM, TOOLS)).toBeNull();
      expect(c.recordItem('media', 'x', null, LOADED)).toBe(false);
      expect(c.itemStatus('media', 'x', null)).toEqual({ upToDate: false, reason: 'cache off' });
    } finally { delete process.env.HITL_NO_CHECK_CACHE; }
  });
});
