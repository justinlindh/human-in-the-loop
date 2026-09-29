// Finds seeded moments in the event index (build.js): which seed, bot and week an event happens in,
// and the snapshot to load to stage it.
//
//   node scripts/events/find.js <event id or type> [--choice N] [--bot b] [--seed N] [--era e]
//        [--stage garage|floor|hq|0|1|2] [--weeks a-b] [--prop p] [--snapshot] [--limit 5]
//        [--json] [--build] [--where '<js>' [--setup '<js>'] [--turn-while '<js>']] [--scan | --no-scan]
//        [--scan-seeds 1-60] [--scan-bots a,b]
//        [--then '<js>' [--within 52] | --branch '<js body>'] [--before '<js>'] [--bot-js '<js>'] [--extra '<js>'] [--rank '<js>'] [--explain]
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
//
// Bot plan: --bot-js '<js over s>' names the bot to play each week (default: the run's bot), --before
// '<js over s>' runs on the state before the bot decides and again before its turn, and --extra
// '<js over e, s>' returns fields merged into each match's row (a desk count, say).
//
// Look-ahead: --then '<js over e, s, m>' keeps each --where moment (m: its fields, m.e its event, m.s
// its state) waiting up to --within weeks (52) for a later event or week where it returns truthy; the
// snapshot is still from before the tick of the --where moment, and a non-boolean result is kept as
// `result`. --rank '<js over m>' orders the matches by a number, highest first, and plays every seed
// in range to do it. Branching: --branch '<js function body over s, e, m, sim>' plays each --where
// moment forward on a copy of its state (s: the state after the tick; m: the moment's fields) and
// keeps the match when the body returns truthy, its value kept as `result` for --rank and the output.
// `sim` has dispatch(s, action), tick(s), botDecide, botTurn and step(s, { choose }), one live week:
// a pending decision answered from `choose` ({ <event id>: choice, default: choice }), then the tick,
// returning every event raised. So "post a meme, then count the replies over three weeks, with no
// decision or era card" is one body that returns false when `s.pendingDecision` or the era shows up.
// The snapshot is still from before the tick of the --where moment. With no match, a scan says which `&&` part of --where no run ever made true
// (--json --explain prints matches and those counts as one object).

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
const q = parseQuery(argv.filter((a, i) => !['--json', '--build', '--scan', '--no-scan', '--explain'].includes(a) && argv[i - 1] !== '--limit' && a !== '--limit'));
const compile = (flag, args, src) => { try { new Function(...args, `return (${src});`); } catch (e) { refuse('bad-query', `--${flag} is not a JS expression: ${e.message}`); } };
if (typeof q.where === 'string') compile('where', ['e', 's'], q.where);
if (typeof q.then === 'string') { if (typeof q.where !== 'string') refuse('bad-query', '--then needs a --where to look ahead from'); compile('then', ['e', 's', 'm'], q.then); }
if (typeof q.branch === 'string') {
  if (typeof q.where !== 'string') refuse('bad-query', '--branch needs a --where moment to play forward from');
  if (typeof q.then === 'string') refuse('bad-query', '--branch and --then are two ways to look ahead; use one');
  try { new Function('s', 'e', 'm', 'sim', q.branch); } catch (e) { refuse('bad-query', `--branch is not a JS function body: ${e.message}`); }
}
if (typeof q['bot-js'] === 'string') compile('bot-js', ['s'], q['bot-js']);
if (typeof q.extra === 'string') compile('extra', ['e', 's'], q.extra);
if (typeof q.rank === 'string') { if (typeof q.where !== 'string') refuse('bad-query', '--rank needs a --where to rank matches of'); compile('rank', ['m'], q.rank); }
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
if (typeof q.then === 'string' || typeof q.rank === 'string' || typeof q.branch === 'string') needsState = true;
if ((needsState || (!rows.length && (where || argv.includes('--scan')))) && !argv.includes('--no-scan')) {
  if (!where) refuse('bad-query', '--scan needs a --where predicate to look for');
  // Filters a scan cannot apply (they read index-only fields) are refused rather than ignored.
  for (const k of ['choice', 'prop', 'snapshot', 'pre']) if (q[k] != null) refuse('bad-query', `--${k} filters index rows and cannot be applied to a scan`);
  const meta = idx.meta;
  const seeds = q.seed != null ? [Number(q.seed)] : q['scan-seeds'] ? range(q['scan-seeds']) : range('1-60');
  const bots = q['scan-bots'] ? String(q['scan-bots']).split(',') : q.bot ? [q.bot] : meta.bots;
  const t0 = Date.now();
  scanned = await scan(hash, { id: q.id ?? null, where, then: typeof q.then === 'string' ? q.then : '', within: Number(q.within) || 52, branch: typeof q.branch === 'string' ? q.branch : '', rank: typeof q.rank === 'string' ? q.rank : '', setup: q.setup ?? '', before: q.before ?? '', botJs: q['bot-js'] ?? '', extra: q.extra ?? '', filter: { era: q.era, stage: q.stage, from: q.from, to: q.to }, turnWhile: q['turn-while'] ?? '', seeds, bots, limit, perRun: Number(q['per-run']) || (typeof q.rank === 'string' ? 5 : 1), weeks: Number(q['scan-weeks']) || 1040,
    onProgress: (d, n) => { if (d % 10 === 0) console.error(`find: scanned ${d}/${n} runs (${Math.round((Date.now() - t0) / 1000)} s)`); } });
  if (scanned.error) refuse('scan-failed', `the scan failed: ${scanned.error}`);
  if (scanned.dropped && !scanned.rows.length) refuse('scan-failed', `${scanned.dropped} moment(s) matching --where were dropped while waiting on --then (too many waiting at once): narrow --where or shorten --within`);
  rows = scanned.rows;
}
const withFile = (r) => (r.scanned ? { ...r, snapshotFile: join(indexDir(hash), 'scan/snapshots', r.snapshot) } : r);
// What the scan learned about each `&&` part of the predicate: one that no played run ever made true
// says no bot game reaches it (a mock or a bot change is needed, not more seeds).
const never = scanned ? scanned.clauses.filter((c) => c.runsTrue === 0).map((c) => c.expr) : [];
if (scanned && !rows.length) console.error(`find: no match in ${scanned.runs} runs${never.length ? `; never true in any run: ${never.map((c) => `\`${c}\``).join(', ')}, so no run played here reaches it` : ''}${typeof q.then === 'string' && scanned.started && !never.length ? `; ${scanned.started} moment(s) matched --where and none satisfied --then within ${Number(q.within) || 52} weeks` : ''}`);
if (JSON_OUT && argv.includes('--explain')) console.log(JSON.stringify({ matches: rows.slice(0, limit).map(withFile), scan: scanned ? { runs: scanned.runs, clauses: scanned.clauses, unreachable: never, dropped: scanned.dropped, whereMatchesWithoutThen: typeof q.then === 'string' ? scanned.started - rows.length : null } : null }, null, 1));
else if (JSON_OUT) console.log(JSON.stringify(rows.slice(0, limit).map(withFile), null, 1));
else {
  for (const r of rows.slice(0, limit)) {
    console.log(`${r.id} seed ${r.seed} bot ${r.bot} week ${r.week} era ${r.era} stage ${r.stage} staff ${r.staff}${r.choice != null ? ` choice ${r.choice}` : ''}${r.stageProp ? ` prop ${r.stageProp}` : ''}${r.rank != null ? ` rank ${r.rank}` : ''}${r.result != null ? ` result ${JSON.stringify(r.result)}` : ''}${r.snapshot ? ` snapshot ${join(indexDir(hash), r.scanned ? 'scan/snapshots' : 'snapshots', r.snapshot)}` : ''}`);
  }
  console.log(scanned ? `find: ${rows.length} match(es) from a scan (${scanned.cached} cached, ${scanned.played} runs played)` : `find: ${rows.length} match(es) of ${idx.rows.length} rows (${idx.meta.bots.join(', ')}; seeds ${idx.meta.seeds[0]}-${idx.meta.seeds[idx.meta.seeds.length - 1]})`);
}
process.exit(rows.length ? 0 : 1);
