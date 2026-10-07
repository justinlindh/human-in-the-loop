import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLYPHS, glyphSvg } from './glyphs.js';
import { ICON_DIR } from './icon-art.js';

// build-glyphs.js deletes every SVG in the folder and rewrites it from glyphs.js, so a glyph that exists only
// as a file is lost the next time it runs.
describe('glyph source and public/icons/glyphs', () => {
  const dir = resolve(ICON_DIR, 'glyphs');
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

  it('has a source entry for every SVG file and a file for every entry', () => {
    expect(files).toEqual(Object.keys(GLYPHS).sort());
  });

  it('has files that are exactly what the builder writes', () => {
    for (const name of Object.keys(GLYPHS)) expect(readFileSync(resolve(dir, `${name}.svg`), 'utf8'), name).toBe(glyphSvg(name));
  });
});
