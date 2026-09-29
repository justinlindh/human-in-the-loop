import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { storageEntries } from '../../scripts/tools/drive.mjs';
import { INDEX_KEY, listSaves, loadGame } from '../../src/save/save.js';

const DRIVE = resolve(__dirname, '../../scripts/tools/drive.mjs');
const drive = (...args) => spawnSync(process.execPath, [DRIVE, ...args], { encoding: 'utf8', timeout: 120000 });

describe('drive storage seeding', () => {
  it('writes n saved companies the title screen can list and load', async () => {
    const entries = await storageEntries({ saves: 3, seed: 5 });
    const mem = { getItem: (k) => entries[k] ?? null, setItem() {}, removeItem() {} };
    const saves = listSaves(mem);
    expect(saves.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
    expect(Object.keys(entries)).toContain(INDEX_KEY);
    expect(loadGame(mem, 's2')?.state?.seed ?? loadGame(mem, 's2')?.seed).toBe(6);
  });

  it('adds keys from a file over the saves, stringifying non-strings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drive-storage-'));
    try {
      const file = join(dir, 's.json');
      writeFileSync(file, JSON.stringify({ a: 'x', b: { n: 1 }, [INDEX_KEY]: 'over' }));
      const entries = await storageEntries({ saves: 1, storageFile: file });
      expect(entries.a).toBe('x');
      expect(entries.b).toBe('{"n":1}');
      expect(entries[INDEX_KEY]).toBe('over');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses bad input before any browser starts', async () => {
    for (const saves of [0, 7, 1.5, 'x', true]) await expect(storageEntries({ saves })).rejects.toThrow(/--saves wants/);
    await expect(storageEntries({ storageFile: '/nonexistent/s.json' })).rejects.toThrow(/--storage-file/);
    const dir = mkdtempSync(join(tmpdir(), 'drive-storage-'));
    try {
      const file = join(dir, 'a.json');
      writeFileSync(file, '[1]');
      await expect(storageEntries({ storageFile: file })).rejects.toThrow(/JSON object/);
      const r = drive('--saves', '9');
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toContain('--saves wants');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
