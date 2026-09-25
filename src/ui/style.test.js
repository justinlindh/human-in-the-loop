import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// A merge that drops a closing brace swallows every rule after it without any error, so the
// stylesheet's blocks must balance.
describe('style.css', () => {
  it('has balanced braces at every top-level rule', () => {
    const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
