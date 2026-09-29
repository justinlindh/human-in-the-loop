#!/usr/bin/env node
// Writes the trailer's pinned game states (scripts/trailer/pins.js) into scripts/trailer/snapshots/.
// Replays each source game under capture, gzips the state it ends on, and records where it came from
// in pins.json. Run it when a sim change moves a beat's subject, then rebuild the trailer.
//
//   node scripts/trailer/pin.mjs [name ...]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PIN_SOURCES } from './config.js';
import { PIN_DIR } from './pins.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = join(root, PIN_DIR);
const want = process.argv.slice(2);
const names = Object.keys(PIN_SOURCES).filter((n) => !want.length || want.includes(n));
mkdirSync(dir, { recursive: true });
let log = {};
try { log = JSON.parse(readFileSync(join(dir, 'pins.json'), 'utf8')); } catch { /* first run */ }

const replays = names.filter((n) => PIN_SOURCES[n].setup);
if (replays.length) {
  const out = mkdtempSync(join(tmpdir(), 'trailer-pin-'));
  const r = spawnSync(join(root, 'scripts/with-render-lock.sh'), ['--gpu', 'node', join(root, 'scripts/capture.js'), '--manifest', join(root, 'scripts/trailer/pin-manifest.js'), '--out', out, '--only', replays.map((n) => `pin-${n}`).join(',')], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error('pin: the capture failed'); process.exit(1); }
  const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
  for (const n of replays) {
    const mark = (index.items?.[`pin-${n}`] ?? index[`pin-${n}`])?.marks?.find((m) => m.label?.startsWith('state '));
    if (!mark) { console.error(`pin: ${n} produced no state`); process.exit(1); }
    const state = JSON.parse(mark.label.slice(6));
    writeFileSync(join(dir, `${n}.snap`), gzipSync(JSON.stringify(state), { level: 9, mtime: 0 }));
    log[n] = { query: PIN_SOURCES[n].query, seed: state.seed, week: state.week };
    console.log(`pin: ${n} week ${state.week}`);
  }
}
for (const n of names.filter((x) => PIN_SOURCES[x].moment)) {
  const { resolveTarget } = await import(join(root, 'scripts/events/load.js'));
  const { simHash, indexDir } = await import(join(root, 'scripts/events/lib.js'));
  const t = resolveTarget({ event: `${PIN_SOURCES[n].moment} --pre` });
  if (!t.row?.preTick) { console.error(`pin: ${n} has no indexed pre-tick snapshot`); process.exit(1); }
  copyFileSync(join(indexDir(simHash()), 'snapshots', t.row.preTick), join(dir, `${n}.snap`));
  log[n] = { moment: PIN_SOURCES[n].moment, seed: t.row.seed, bot: t.row.bot, week: t.row.week };
  console.log(`pin: ${n} seed ${t.row.seed} week ${t.row.week}`);
}
writeFileSync(join(dir, 'pins.json'), `${JSON.stringify(log, null, 2)}\n`);
