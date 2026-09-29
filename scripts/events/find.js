// Finds seeded moments in the event index (build.js): which seed, bot and week an event happens in,
// and the snapshot to load to stage it.
//
//   node scripts/events/find.js <event id or type> [--choice N] [--bot b] [--seed N] [--era e]
//        [--stage garage|floor|hq|0|1|2] [--weeks a-b] [--prop p] [--snapshot] [--limit 5]
//        [--json] [--build] [--where '<js>' [--setup '<js>'] [--turn-while '<js>']] [--scan | --no-scan]
//        [--scan-seeds 1-60] [--scan-bots a,b]
//
//   printer_jam --choice 0 --stage floor --limit 3
//   era --era agents --snapshot
//   --where "e.type === 'week' && s.outage?.weeks === 0 && s.officeStage === 1" --limit 3
//
// --where is a predicate over the event `e` and that week's state `s` (see scan.js). Index rows that
// satisfy one that never reads `s` answer it. One that reads `s`, or that matches no index row, needs
// states the index does not hold, so find plays seeds and bots for it (--scan-seeds, default 1-60; --scan-bots, default the index's bots,
// or --bot), stops at --limit matches, and writes each as a loadable snapshot. A plain query scans
// only with --scan, and never with --no-scan; results are cached by sim hash, so a repeat is instant.

// Prints one line per match: seed, bot, week, era, stage, staff, the choice and the snapshot path
// (--json prints rows). The index must match this checkout's sim code: if it does not, find refuses,
// or builds it first with --build (build.js's defaults).
//
// Exit codes, so a caller can tell "nothing matches" from "can't answer": 0 with matches; 1 with
// none (--json prints []); 2 when find refuses. With --json a refusal prints
// { "error": "<reason>", "kind": "stale-index" | "no-index" | "build-failed" | "bad-index" | "no-query" | "bad-query" | "scan-failed" }:
// stale-index when indexes exist but none for this sim code, no-index when there are none at all.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CACHE, simHash, readIndex, match, parseQuery, indexDir } from './lib.js';
import { scan } from './scan.js';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
function refuse(kind, error) {
  if (JSON_OUT) console.log(JSON.stringify({ error, kind }));
  else console.error(`find: ${error}`);
  process.exit(2);
}
const q = parseQuery(argv.filter((a, i) => !['--json', '--build', '--scan', '--no-scan'].includes(a) && argv[i - 1] !== '--limit' && a !== '--limit'));
if (typeof q.where === 'string') { try { new Function('e', 's', `return (${q.where});`); } catch (e) { refuse('bad-query', `--where is not a JS expression: ${e.message}`); } }
const limitAt = argv.indexOf('--limit');
const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : 5;
if (!q.id && typeof q.where !== 'string') refuse('no-query', 'no event id or type given');
const hash = simHash();
let idx;
try { idx = readIndex(hash); } catch (e) { refuse('bad-index', `the event index for this sim code (${hash}) can't be read: ${e.message}`); }
if (!idx && argv.includes('--build')) {
  // With --json, the build's progress goes to stderr so stdout stays one JSON value.
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/events/build.js')], { stdio: ['ignore', JSON_OUT ? 2 : 'inherit', 'inherit'] });
  if (r.status !== 0) refuse('build-failed', `building the event index failed (exit ${r.status})`);
  try { idx = readIndex(hash); } catch (e) { refuse('bad-index', `the event index just built can't be read: ${e.message}`); }
}
if (!idx) {
  const others = existsSync(CACHE) ? readdirSync(CACHE).filter((d) => existsSync(join(CACHE, d, 'events.jsonl.gz'))).length : 0;
  refuse(others ? 'stale-index' : 'no-index', `no event index for this sim code (${hash})${others ? ` (${others} for other sim code)` : ''}; build it with node scripts/events/build.js, or pass --build`);
}
const range = (v) => String(v).split(',').flatMap((x) => { const [a, b] = x.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
const where = typeof q.where === 'string' ? q.where : null;
// A predicate that never reads the state can be answered from the index rows alone.
const NEEDS_STATE = Symbol('needs state');
const stateless = new Proxy({}, { get() { throw NEEDS_STATE; } });
let needsState = false;
let rows = [];
if (where) {
  const pred = new Function('e', 's', `return (${where});`);
  try { rows = match(idx.rows, q).filter((r) => pred(r, stateless)); } catch (e) { if (e === NEEDS_STATE) needsState = true; else refuse('bad-query', `--where failed on an index row: ${e.message}`); }
} else rows = match(idx.rows, q);
let scanned = null;
if ((needsState || (!rows.length && (where || argv.includes('--scan')))) && !argv.includes('--no-scan')) {
  if (!where) refuse('bad-query', '--scan needs a --where predicate to look for');
  const meta = idx.meta;
  const seeds = q['scan-seeds'] ? range(q['scan-seeds']) : range('1-60');
  const bots = q['scan-bots'] ? String(q['scan-bots']).split(',') : q.bot ? [q.bot] : meta.bots;
  const t0 = Date.now();
  scanned = await scan(hash, { id: q.id ?? null, where, setup: q.setup ?? '', turnWhile: q['turn-while'] ?? '', seeds, bots, limit, weeks: Number(q['scan-weeks']) || 1040,
    onProgress: (d, n) => { if (d % 10 === 0) console.error(`find: scanned ${d}/${n} runs (${Math.round((Date.now() - t0) / 1000)} s)`); } });
  if (scanned.error) refuse('scan-failed', `the scan failed: ${scanned.error}`);
  rows = scanned.rows;
}
const withFile = (r) => (r.scanned ? { ...r, snapshotFile: join(indexDir(hash), 'scan/snapshots', r.snapshot) } : r);
if (JSON_OUT) console.log(JSON.stringify(rows.slice(0, limit).map(withFile), null, 1));
else {
  for (const r of rows.slice(0, limit)) {
    console.log(`${r.id} seed ${r.seed} bot ${r.bot} week ${r.week} era ${r.era} stage ${r.stage} staff ${r.staff}${r.choice != null ? ` choice ${r.choice}` : ''}${r.stageProp ? ` prop ${r.stageProp}` : ''}${r.snapshot ? ` snapshot ${join(indexDir(hash), r.scanned ? 'scan/snapshots' : 'snapshots', r.snapshot)}` : ''}`);
  }
  console.log(scanned ? `find: ${rows.length} match(es) from a scan (${scanned.cached} cached, ${scanned.played} runs played)` : `find: ${rows.length} match(es) of ${idx.rows.length} rows (${idx.meta.bots.join(', ')}; seeds ${idx.meta.seeds[0]}-${idx.meta.seeds[idx.meta.seeds.length - 1]})`);
}
process.exit(rows.length ? 0 : 1);
