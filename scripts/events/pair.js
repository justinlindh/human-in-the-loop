// A paired bot-run comparison between two checkouts: every bot plays seeds 1..N on each side's own
// sim code, and the runs are compared seed by seed. Built from sim's hand-rolled identity and NOC
// balance comparisons.
//
//   node scripts/events/pair.js [--a <root>] [--b <root>] [--bots balanced,sensible] [--seeds 300]
//        [--start-era <era>]
//        [--fields 'name: <js over r, s>, name2: <js>'] [--jobs N] [--json out.json] [--timeout 3600]
//
// --start-era founds every bot company in that era on both sides (default Classic; an unknown era exits 2).
// --a is the base (default: origin/main, in a temporary worktree removed afterwards) and --b the
// change (default: this checkout). Per bot it reports how many seeds end identically (ending reason,
// weeks, score and final random state), exit % before and after with the seeds lost (exited on a, not
// on b) and gained, median score and weeks, and totals of incidents, caught and breaches. --fields is a
// list of `name: <JS over the run's result r and its final state s>` (an object-literal body); each
// becomes a column (numbers add up, booleans count true, other values are counted), evaluated on its
// own with each side's own code, and a side where one throws reports just that field as missing. Both sides run in parallel
// under nice, and the comparison waits for both. Output: a markdown table on stdout (paste it into a
// PR), and with --json the per-run records and per-bot summary. Exit 0; 2 when an argument is bad (a root without src/sim/bots.js, a --fields
// part that is not `name: expr`) or a side failed or timed out. A mismatch between the two sides' run
// sets is printed.
//
// Side a is cached under ~/.cache/hitl-ci/pair (HITL_PAIR_CACHE_DIR moves it, HITL_NO_CHECK_CACHE=1
// turns it off), keyed by the content of its src/sim and src/data files, the bots, seeds, era and
// --fields, this script and Node: a repeat against an unchanged base reads the records and plays only
// side b, without making the base worktree.
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, renameSync, rmSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, cpus, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorktree } from '../tools/worktree.mjs';
import { logTiming } from '../lib/timing.js';
import { compare, markdown, parseFields, sideKey } from './pair-report.js';

const fail = (msg) => { console.error(`pair: ${msg}`); process.exit(2); };
const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

// What a side's runs depend on: the sim and its data (nothing in src/sim imports from elsewhere).
const SIM_FILE = /^src\/(sim|data)\/.*\.(js|mjs|json)$/;
const createHashOf = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
const git = (cwd, args, input) => execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
// [path, blob id] for each sim and data file of a checkout (as it stands on disk) or of a revision;
// null when git cannot say, which means no caching.
function simFiles(repo, rev) {
  try {
    if (rev) {
      return git(repo, ['ls-tree', '-r', rev, '--', 'src/sim', 'src/data']).split('\n').filter(Boolean)
        .map((l) => { const [meta, path] = l.split('\t'); return [path, meta.split(' ')[2]]; }).filter(([p]) => SIM_FILE.test(p) && !p.endsWith('.test.js'));
    }
    const paths = git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/sim', 'src/data']).split('\n')
      .filter((p) => p && SIM_FILE.test(p) && !p.endsWith('.test.js') && existsSync(join(repo, p)));
    const ids = git(repo, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`).split('\n').filter(Boolean);
    return paths.map((p, i) => [p, ids[i]]);
  } catch { return null; }
}
const cacheDir = () => process.env.HITL_PAIR_CACHE_DIR || join(homedir(), '.cache', 'hitl-ci', 'pair');
function readSide(key) {
  try { return JSON.parse(readFileSync(join(cacheDir(), `${key}.json`), 'utf8')); } catch { return null; }
}
function writeSide(key, records) {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    const tmpFile = join(cacheDir(), `${key}.${process.pid}.tmp`);
    writeFileSync(tmpFile, JSON.stringify(records));
    renameSync(tmpFile, join(cacheDir(), `${key}.json`));
    // Entries for bases that no longer exist are never matched again.
    for (const n of readdirSync(cacheDir())) {
      const f = join(cacheDir(), n);
      if (Date.now() - statSync(f).mtimeMs > 14 * 864e5) rmSync(f, { force: true });
    }
  } catch { /* a cache that cannot be written only costs a run next time */ }
}

async function runOne({ root, bot, seed, fields, startEra }) {
  const { runBot } = await import(pathToFileURL(join(root, 'src/sim/bots.js')).href);
  const r = startEra ? runBot(bot, seed, undefined, { founding: { startEra } }) : runBot(bot, seed);
  const s = r.state;
  // Each field is its own expression, so one that throws on this side blanks only itself.
  let extra;
  if (fields?.length) {
    extra = {};
    for (const f of fields) { try { extra[f.name] = new Function('r', 's', `return (${f.expr});`)(r, s); } catch { extra[f.name] = null; } }
  }
  return [`${bot}:${seed}`, { reason: r.reason, exited: !!r.exited, won: !!r.won, weeks: r.weeks, score: r.score,
    incidents: s.stats?.incidents ?? 0, caught: s.stats?.caught ?? 0, breaches: s.stats?.breaches ?? 0,
    era: s.founding?.startEra ?? null, hash: [r.reason, r.weeks, r.score, s.rng?.s].join('|'), fields: extra }];
}

if (!isMainThread) {
  (async () => {
    const out = [];
    for (const run of workerData.runs) out.push(await runOne({ ...run, root: workerData.root, fields: workerData.fields, startEra: workerData.startEra }));
    parentPort.postMessage(out);
  })();
} else if (process.argv.includes('--side')) {
  // One side: plays every (bot, seed) over worker threads and writes its records to a file.
  const [root, outFile] = [process.argv[process.argv.indexOf('--side') + 1], process.argv[process.argv.indexOf('--out') + 1]];
  const spec = JSON.parse(process.env.PAIR_SPEC);
  try { process.setPriority(10); } catch { /* keep the default */ }
  const runs = spec.bots.flatMap((bot) => Array.from({ length: spec.seeds }, (_, i) => ({ bot, seed: i + 1 })));
  const n = Math.max(1, Math.min(spec.jobs, runs.length));
  // Runs are dealt out one at a time so a slow bot does not leave one worker with all the work.
  const chunks = Array.from({ length: n }, () => []);
  runs.forEach((r, i) => chunks[i % n].push(r));
  const parts = await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const w = new Worker(SELF, { workerData: { root, runs: c, fields: spec.fields, startEra: spec.startEra } });
    w.once('message', res); w.once('error', rej);
  })));
  writeFileSync(outFile, JSON.stringify(Object.fromEntries(parts.flat())));
  process.exit(0);
} else {
  const argv = process.argv.slice(2);
  const USAGE = 'usage: node scripts/events/pair.js [--a <root>] [--b <root>] [--bots x,y] [--seeds 300] [--start-era <era>] [--fields \'<js>\'] [--jobs N] [--json out.json] [--timeout 3600]';
  if (argv.includes('--help') || argv.includes('-h')) { console.log(USAGE); process.exit(0); }
  const KNOWN = new Set(['a', 'b', 'bots', 'seeds', 'start-era', 'fields', 'jobs', 'json', 'timeout']);
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)$/.exec(argv[i]);
    if (!m || !KNOWN.has(m[1])) { console.error(`pair: unrecognised argument ${argv[i]}\n${USAGE}`); process.exit(2); }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) { console.error(`pair: --${m[1]} needs a value\n${USAGE}`); process.exit(2); }
    i++;
  }
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const seeds = Number(opt('seeds', 300));
  const fields = opt('fields', '');
  const jobs = Number(opt('jobs', Math.max(1, Math.floor(cpus().length / 8))));
  const timeoutMs = Number(opt('timeout', 3600)) * 1000;
  const bootRoot = resolve(HERE, '..', '..');
  // Everything that can be refused is checked before the temporary directory or the base worktree
  // exists, so a bad argument leaves nothing behind.
  const b = resolve(opt('b', bootRoot));
  let a = opt('a') ? resolve(opt('a')) : null;
  let parsed = [];
  try { parsed = parseFields(fields); } catch (e) { fail(`--fields: ${e.message}`); }
  for (const [flag, root] of [['a', a], ['b', b]]) if (root && !existsSync(join(root, 'src/sim/bots.js'))) fail(`--${flag} ${root} is not a checkout with src/sim/bots.js`);
  const { BOTS } = await import(pathToFileURL(join(b, 'src/sim/bots.js')).href);
  const bots = opt('bots', Object.keys(BOTS).join(',')).split(',');
  const startEra = opt('start-era', null);
  if (argv.includes('--start-era') && (!startEra || startEra.startsWith('--'))) fail('--start-era needs an era name');
  if (startEra) {
    const { ERA_STARTS } = await import(pathToFileURL(join(b, 'src/data/era-modes.js')).href);
    if (!Object.hasOwn(ERA_STARTS, startEra)) fail(`unknown starting era: ${startEra}`);
  }
  const spec = JSON.stringify({ bots, seeds, jobs, fields: parsed, startEra });
  const tmp = mkdtempSync(join(tmpdir(), 'pair-'));
  let baseWorktree = null;
  let code = 0;
  // Each side's process runs until it ends or this process does, whichever comes first.
  const sides = new Set();
  // The temporary directory goes here too: a signal handler exits without running the finally below.
  process.on('exit', () => { for (const c of sides) { try { c.kill('SIGKILL'); } catch { /* gone */ } } rmSync(tmp, { recursive: true, force: true }); });
  try {
    if (!a) execFileSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: b, stdio: 'ignore' });
    // Side a's records are cached by the content of what they were played on.
    const aFiles = process.env.HITL_NO_CHECK_CACHE === '1' ? null : a ? simFiles(a) : simFiles(b, 'origin/main');
    const keyA = aFiles && sideKey({ files: aFiles, bots, seeds, startEra, fields: parsed, script: createHashOf(SELF), node: process.version });
    let cachedA = keyA ? readSide(keyA) : null;
    logTiming({ kind: 'cache', tool: 'pair', cache: !keyA ? 'off' : cachedA ? 'hit' : 'miss', input: keyA ?? undefined });
    if (!a && !cachedA) {
      // Removed on every way out of this process (error, timeout, signal), not only the normal one.
      baseWorktree = await createWorktree({ repo: b, rev: 'origin/main', label: 'pair' });
      a = baseWorktree.path;
    }
    const t0 = Date.now();
    const side = (root, name) => new Promise((res) => {
      const out = join(tmp, `${name}.json`);
      const child = spawn(process.execPath, [SELF, '--side', root, '--out', out], { env: { ...process.env, PAIR_SPEC: spec }, stdio: ['ignore', 'inherit', 'inherit'] });
      sides.add(child);
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('exit', (c) => { clearTimeout(timer); sides.delete(child); res({ name, code: c, out }); });
    });
    // Wait on both processes, never on a sleep.
    if (cachedA) console.log(`pair: side a read from the cache (${keyA.slice(0, 8)}), not played`);
    const [sa, sb] = await Promise.all([cachedA ? { name: 'a', code: 0 } : side(a, 'a'), side(b, 'b')]);
    if (sa.code !== 0 || sb.code !== 0) { console.error(`pair: side ${sa.code !== 0 ? 'a' : 'b'} failed (exit ${sa.code !== 0 ? sa.code : sb.code}) or timed out`); code = 2; }
    else {
      const A = cachedA ?? JSON.parse(readFileSync(sa.out, 'utf8')), B = JSON.parse(readFileSync(sb.out, 'utf8'));
      if (startEra) {
        for (const [name, recs] of [['a', A], ['b', B]]) {
          const off = Object.values(recs).filter((r) => (r.era ?? 'classic') !== startEra).length;
          if (off) fail(`side ${name} did not start ${off} run(s) in ${startEra} (its sim predates --start-era?)`);
        }
      }
      if (keyA && !cachedA) writeSide(keyA, A);
      const result = compare(A, B);
      console.log(markdown(result, { a: 'a', b: 'b' }));
      if (result.onlyA.length || result.onlyB.length) console.log(`\nrun sets differ: ${result.onlyA.length} run(s) only on a (${result.onlyA.slice(0, 5).join(', ')}), ${result.onlyB.length} only on b (${result.onlyB.slice(0, 5).join(', ')}); only the ${result.runs} runs on both are compared.`);
      console.log(`\n${result.runs} paired runs (${bots.join(', ')}; seeds 1-${seeds}${startEra ? `; start era ${startEra}` : ''}) in ${Math.round((Date.now() - t0) / 1000)} s.`);
      const jf = opt('json');
      if (jf) writeFileSync(jf, JSON.stringify({ a: a ?? 'origin/main', b, bots, seeds, startEra: startEra ?? 'classic', summary: result.rows.map((r) => ({ ...r, lost: r.lost, gained: r.gained })), runs: { a: A, b: B } }, null, 1));
    }
  } finally {
    baseWorktree?.disposeSync();
    rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}
