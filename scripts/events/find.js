// Finds seeded moments in the event index (build.js): which seed, bot and week an event happens in,
// and the snapshot to load to stage it.
//
//   node scripts/events/find.js <event id or type> [--choice N] [--bot b] [--seed N] [--era e]
//        [--stage garage|floor|hq|0|1|2] [--weeks a-b] [--prop p] [--snapshot] [--limit 5]
//        [--json] [--build]
//
//   printer_jam --choice 0 --stage floor --limit 3
//   era --era agents --snapshot
//
// Prints one line per match: seed, bot, week, era, stage, staff, the choice and the snapshot path
// (--json prints rows). The index must match this checkout's sim code: if it does not, find refuses,
// or builds it first with --build (build.js's defaults).
//
// Exit codes, so a caller can tell "nothing matches" from "can't answer": 0 with matches; 1 with
// none (--json prints []); 2 when find refuses. With --json a refusal prints
// { "error": "<reason>", "kind": "stale-index" | "no-index" | "build-failed" | "bad-index" | "no-query" }:
// stale-index when indexes exist but none for this sim code, no-index when there are none at all.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CACHE, simHash, readIndex, match, parseQuery, indexDir } from './lib.js';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
function refuse(kind, error) {
  if (JSON_OUT) console.log(JSON.stringify({ error, kind }));
  else console.error(`find: ${error}`);
  process.exit(2);
}
const q = parseQuery(argv.filter((a, i) => !['--json', '--build'].includes(a) && argv[i - 1] !== '--limit' && a !== '--limit'));
const limitAt = argv.indexOf('--limit');
const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : 5;
if (!q.id) refuse('no-query', 'no event id or type given');
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
const rows = match(idx.rows, q);
if (JSON_OUT) console.log(JSON.stringify(rows.slice(0, limit), null, 1));
else {
  for (const r of rows.slice(0, limit)) {
    console.log(`${r.id} seed ${r.seed} bot ${r.bot} week ${r.week} era ${r.era} stage ${r.stage} staff ${r.staff}${r.choice != null ? ` choice ${r.choice}` : ''}${r.stageProp ? ` prop ${r.stageProp}` : ''}${r.snapshot ? ` snapshot ${join(indexDir(hash), 'snapshots', r.snapshot)}` : ''}`);
  }
  console.log(`find: ${rows.length} match(es) of ${idx.rows.length} rows (${idx.meta.bots.join(', ')}; seeds ${idx.meta.seeds[0]}-${idx.meta.seeds[idx.meta.seeds.length - 1]})`);
}
process.exit(rows.length ? 0 : 1);
