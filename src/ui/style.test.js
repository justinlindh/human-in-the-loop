import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// The overlay's stylesheets live in styles/ as NN-name.css and load in file-name order.
const dir = new URL('./styles/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.css')).sort();

describe('ui stylesheets', () => {
  it('are all numbered so their load order is explicit', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f).toMatch(/^\d{2}-[a-z0-9-]+\.css$/);
    const nums = files.map((f) => f.slice(0, 2));
    expect(new Set(nums).size).toBe(nums.length);
  });

  // A merge that drops a closing brace swallows every rule after it without any error, so each
  // file's blocks must balance on their own.
  it.each(files)('%s has balanced braces', (f) => {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
