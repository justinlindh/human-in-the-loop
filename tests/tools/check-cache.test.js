import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join } from 'node:path';

let dir;
beforeEach(() => { dir = mkdtempSync(join(toolTmp(), 'check-cache-')); process.env.HITL_CHECK_CACHE_DIR = dir; });
afterEach(() => { delete process.env.HITL_CHECK_CACHE_DIR; rmSync(dir, { recursive: true, force: true }); });

const load = () => import('../../blender/checks/cache.mjs');
const REF = 'blender/checks/golden.mjs';

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
