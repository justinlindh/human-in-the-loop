import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// UI code shows help text through tooltip.js (data-tip, or a title prop that h() converts), never
// the browser's native title bubble, which is unstyled and never appears on touch.
const ROOT = new URL('.', import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.js$/.test(f) && !/\.test\.js$/.test(f) ? [p] : [];
});
const NATIVE = [/\.title\s*=[^=]/, /setAttribute\(\s*['"]title['"]/, /\btitle=["'`]/, /\[title\]/];

describe('no native title tooltips in the UI', () => {
  it('sets no title attribute outside tooltip.js', () => {
    const hits = [];
    for (const f of files(ROOT)) {
      if (/tooltip\.js$/.test(f)) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (NATIVE.some((re) => re.test(line))) hits.push(`${f.slice(ROOT.length)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
