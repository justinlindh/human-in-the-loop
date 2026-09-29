import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OWN_PAGE, mainGroups, emptyGroups } from '../../blender/checks/clip-groups.mjs';

const SRC = readFileSync(resolve(__dirname, '../../blender/checks/clip.mjs'), 'utf8');
const registered = [...SRC.match(/const GROUPS = \{([\s\S]*?)\n\};/)[1].matchAll(/^  (\w+): \[/gm)].map((m) => m[1]);

describe('clip groups', () => {
  it('runs every registered group on a floor page unless it opens its own scene', () => {
    const groups = { seats: [], robot: [], garage: [], novel: [] };
    expect(mainGroups(groups)).toEqual(['seats', 'robot', 'novel']);
    expect(OWN_PAGE).toContain('garage');
  });

  it('names a wanted group that returned no case, and only that group', () => {
    expect(emptyGroups(['seats', 'novel', 'perks'], { seats: [{ name: 'a' }], novel: [], perks: [{ name: 'b' }] })).toEqual(['novel']);
    expect(emptyGroups(['ghost'], {})).toEqual(['ghost']);
  });

  it('has a runner for every registered group and registers every group a runner reads', () => {
    expect(registered.length).toBeGreaterThan(8);
    const read = new Set([...SRC.matchAll(/\bruns\.(\w+)/g)].map((m) => m[1]));
    for (const g of registered) expect(read.has(g), `group ${g} is registered but no code reads runs.${g}`).toBe(true);
    for (const g of read) expect(registered, `runs.${g} is read but not registered in GROUPS`).toContain(g);
  });
});
