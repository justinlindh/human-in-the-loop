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
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, simHash, readIndex, match, parseQuery, indexDir } from './lib.js';

const argv = process.argv.slice(2);
const q = parseQuery(argv.filter((a, i) => !['--json', '--build'].includes(a) && argv[i - 1] !== '--limit' && a !== '--limit'));
const limitAt = argv.indexOf('--limit');
const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : 5;
const hash = simHash();
let idx = readIndex(hash);
if (!idx && argv.includes('--build')) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/events/build.js')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  idx = readIndex(hash);
}
if (!idx) {
  console.error(`find: no event index for this sim code (${hash}); build it with node scripts/events/build.js, or pass --build`);
  process.exit(3);
}
const rows = match(idx.rows, q);
if (argv.includes('--json')) console.log(JSON.stringify(rows.slice(0, limit), null, 1));
else {
  for (const r of rows.slice(0, limit)) {
    console.log(`${r.id} seed ${r.seed} bot ${r.bot} week ${r.week} era ${r.era} stage ${r.stage} staff ${r.staff}${r.choice != null ? ` choice ${r.choice}` : ''}${r.stageProp ? ` prop ${r.stageProp}` : ''}${r.snapshot ? ` snapshot ${join(indexDir(hash), 'snapshots', r.snapshot)}` : ''}`);
  }
  console.log(`find: ${rows.length} match(es) of ${idx.rows.length} rows (${idx.meta.bots.join(', ')}; seeds ${idx.meta.seeds[0]}-${idx.meta.seeds[idx.meta.seeds.length - 1]})`);
}
