// Icon names with art in public/icons, read from its manifests on disk: name -> { file, size }.
// Also lists manifest entries whose file is missing. Node only (tests and tools).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICON_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/icons');

export function iconArt(dir = ICON_DIR) {
  const art = new Map();
  const missing = [];
  const root = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  for (const inc of root.include ?? []) {
    const file = resolve(dir, inc);
    if (!existsSync(file)) { missing.push(`sub-manifest ${inc}`); continue; }
    for (const [name, entry] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) art.set(name, entry);
  }
  for (const [name, entry] of Object.entries(root.icons ?? {})) art.set(name, entry);
  for (const [name, entry] of art) if (!existsSync(resolve(dir, entry.file))) missing.push(`${name} -> ${entry.file}`);
  return { art, missing };
}
