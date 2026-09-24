import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ICONS } from '../src/ui/icons.js';

const dir = resolve(__dirname, '../public/icons');
function covered() {
  const map = new Map();
  const root = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  for (const inc of root.include ?? []) {
    const f = resolve(dir, inc);
    if (existsSync(f)) for (const [n, e] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) map.set(n, e);
  }
  for (const [n, e] of Object.entries(root.icons ?? {})) map.set(n, e);
  return map;
}

describe('icon art', () => {
  it('every manifest entry points at a real file', () => {
    for (const [name, e] of covered()) expect(existsSync(resolve(dir, e.file)), name).toBe(true);
  });
  it('no icon name falls back to emoji once the objects manifest exists', () => {
    if (!existsSync(resolve(dir, 'objects/manifest.json'))) return;
    const have = covered();
    expect(Object.keys(ICONS).filter((n) => !have.has(n))).toEqual([]);
  });
});
