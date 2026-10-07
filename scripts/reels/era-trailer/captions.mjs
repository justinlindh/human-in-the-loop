#!/usr/bin/env node
// Writes one caption strip per era beat with the main trailer's own caption renderer (scripts/trailer/cards.js),
// so the segment's text matches the trailer's cards in font, size, casing and look.
//   node scripts/reels/era-trailer/captions.mjs <out dir>
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGraphics } from '../../trailer/cards.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = resolve(process.argv[2] ?? join(root, 'shots/era-seg'));
mkdirSync(dir, { recursive: true });
export const LABELS = {
  inventory: 'Pre-internet: software in boxes',
  float: 'The dot-com boom',
  ie6: 'Web 2.0',
  ai: 'The AI years',
};
const out = await renderGraphics({
  dir, cards: {}, lines: Object.entries(LABELS).map(([id, text]) => ({ id, text })),
  output: { width: 1920, height: 1080, vertical: null }, logoPath: join(root, 'docs/readme/logo.png'), url: '',
});
for (const p of Object.values(out.captions)) console.log(p);
