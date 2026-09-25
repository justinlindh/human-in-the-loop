// Lists icon names that still fall back to an emoji stand-in. Exits non-zero with --strict, and
// always when a manifest points at a missing file.
// Run: node src/ui/tools/icon-coverage.js [--strict]
// icons.js reaches the sim through Vite's import.meta.glob, so it loads through Vite's SSR loader.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { iconArt, ICON_DIR } from './icon-art.js';

const server = await createServer({ root: resolve(ICON_DIR, '../..'), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
let code = 0;
try {
  const { ICONS } = await server.ssrLoadModule('/src/ui/icons.js');
  const { art, missing } = iconArt();
  for (const m of missing) console.log(`manifest points at a missing file: ${m}`);
  const names = Object.keys(ICONS);
  const fallbacks = names.filter((n) => !art.has(n)).sort();
  console.log(`${names.length} icon names, ${names.length - fallbacks.length} with art, ${fallbacks.length} emoji fallbacks`);
  if (fallbacks.length) console.log(`fallbacks: ${fallbacks.join(', ')}`);
  if (missing.length || (process.argv.includes('--strict') && fallbacks.length)) code = 1;
} finally {
  await server.close();
}
process.exit(code);
