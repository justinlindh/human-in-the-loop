import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// src/sim and src/data import only each other. Local CI caches balance passes by a hash of these two
// folders (scripts/ci-local.sh), so an import from anywhere else would change results without
// changing the key.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INSIDE = ['src/sim', 'src/data'];
const SPEC = /(?:\bimport\s*(?:[\w*{}\s,]+\s*from\s*)?|\bexport\s*[\w*{}\s,]*\s*from\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.m?js$/.test(name) && !/\.test\.m?js$/.test(name) ? [p] : [];
  });
}

describe('sim import boundary', () => {
  it('src/sim and src/data import nothing outside themselves', () => {
    const outside = [];
    for (const dir of INSIDE) {
      for (const file of files(join(ROOT, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(SPEC)) {
          const spec = m[1];
          const target = spec.startsWith('.') ? relative(ROOT, resolve(dirname(file), spec)) : spec;
          if (!INSIDE.some((d) => target === d || target.startsWith(`${d}/`))) outside.push(`${relative(ROOT, file)} imports ${spec}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it('catches an import from outside', () => {
    const sample = "import { x } from '../render/a.js';\nexport { y } from 'three';\nconst z = await import('../ui/b.js');";
    expect([...sample.matchAll(SPEC)].map((m) => m[1])).toEqual(['../render/a.js', 'three', '../ui/b.js']);
  });
});
