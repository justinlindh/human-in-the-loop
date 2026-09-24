// Lists icon names that still fall back to an emoji stand-in. Exits non-zero with --strict.
// Run: node src/ui/tools/icon-coverage.js [--strict]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS } from '../icons.js';

const icons = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/icons');
const covered = new Map();
const root = JSON.parse(readFileSync(resolve(icons, 'manifest.json'), 'utf8'));
for (const inc of root.include ?? []) {
  const file = resolve(icons, inc);
  if (!existsSync(file)) { console.log(`missing sub-manifest: ${inc}`); continue; }
  for (const [name, entry] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) covered.set(name, entry);
}
for (const [name, entry] of Object.entries(root.icons ?? {})) covered.set(name, entry);

let broken = 0;
for (const [name, entry] of covered) {
  if (!existsSync(resolve(icons, entry.file))) { console.log(`manifest points at a missing file: ${name} -> ${entry.file}`); broken++; }
}
const fallbacks = Object.keys(ICONS).filter((n) => !covered.has(n)).sort();
console.log(`${Object.keys(ICONS).length} icon names, ${Object.keys(ICONS).length - fallbacks.length} with art, ${fallbacks.length} emoji fallbacks`);
if (fallbacks.length) console.log(`fallbacks: ${fallbacks.join(', ')}`);
if (broken || (process.argv.includes('--strict') && fallbacks.length)) process.exit(1);
