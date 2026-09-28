#!/usr/bin/env node
// Writes docs/effects/ from src/data and balance.js (the renderer is src/sim/effects-report.js).
// --check writes nothing: it lists the files that differ and exits 1 when any do.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { renderEffects } from '../src/sim/effects-report.js';

const dir = 'docs/effects';
const report = renderEffects();
const check = process.argv.includes('--check');
const have = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
const stale = [
  ...Object.entries(report).filter(([f, text]) => !have.includes(f) || readFileSync(`${dir}/${f}`, 'utf8') !== text).map(([f]) => f),
  ...have.filter((f) => !(f in report)),
];
if (check) {
  if (stale.length) { console.log(`effects: stale: ${stale.join(', ')}; run npm run effects`); process.exit(1); }
  console.log('effects: ok');
} else {
  mkdirSync(dir, { recursive: true });
  for (const f of have) if (!(f in report)) rmSync(`${dir}/${f}`);
  for (const [f, text] of Object.entries(report)) writeFileSync(`${dir}/${f}`, text);
  console.log(`effects: wrote ${Object.keys(report).length} files${stale.length ? ` (${stale.join(', ')} changed)` : ', none changed'}`);
}
