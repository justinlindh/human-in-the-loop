// Writes public/icons/glyphs/<name>.svg and public/icons/glyphs/manifest.json from glyphs.js.
// Run: node src/ui/tools/build-glyphs.js
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLYPHS, glyphSvg } from './glyphs.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, 'public/icons/glyphs');
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.svg')) unlinkSync(resolve(out, f));

const manifest = {};
for (const name of Object.keys(GLYPHS)) {
  const file = `${name}.svg`;
  writeFileSync(resolve(out, file), glyphSvg(name));
  manifest[name] = { file: `glyphs/${file}`, ...(GLYPHS[name].size ? { size: GLYPHS[name].size } : {}) };
}
writeFileSync(resolve(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`wrote ${Object.keys(manifest).length} glyphs to ${out}`);
