// A paired bot-run comparison between two checkouts: every bot plays seeds 1..N on each side's own
// sim code, and the runs are compared seed by seed. Built from sim's hand-rolled identity and NOC
// balance comparisons.
//
//   node scripts/events/pair.js [--a <root>] [--b <root>] [--bots balanced,sensible] [--seeds 300]
//        [--fields '<js over r, s>'] [--jobs N] [--json out.json] [--timeout 3600]
//
// --a is the base (default: origin/main, in a temporary worktree removed afterwards) and --b the
// change (default: this checkout). Per bot it reports how many seeds end identically (ending reason,
// weeks, score and final random state), exit % before and after with the seeds lost (exited on a, not
// on b) and gained, median score and weeks, and totals of incidents, caught and breaches. --fields is a
// JS expression over the run's result `r` and its final state `s` that returns an object; each key
// becomes a column (numbers add up, booleans count true, other values are counted), evaluated with each
// side's own code, and a side where it throws reports the field as missing. Both sides run in parallel
// under nice, and the comparison waits for both. Output: a markdown table on stdout (paste it into a
// PR), and with --json the per-run records and per-bot summary. Exit 0; 2 when a side failed or timed out.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compare, markdown } from './pair-report.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

async function runOne({ root, bot, seed, fields }) {
  const { runBot } = await import(pathToFileURL(join(root, 'src/sim/bots.js')).href);
  const r = runBot(bot, seed);
  const s = r.state;
  let extra;
  if (fields) { try { extra = new Function('r', 's', `return (${fields});`)(r, s); } catch { extra = undefined; } }
  return [`${bot}:${seed}`, { reason: r.reason, exited: !!r.exited, won: !!r.won, weeks: r.weeks, score: r.score,
    incidents: s.stats?.incidents ?? 0, caught: s.stats?.caught ?? 0, breaches: s.stats?.breaches ?? 0,
    hash: [r.reason, r.weeks, r.score, s.rng?.s].join('|'), fields: extra }];
}

if (!isMainThread) {
  (async () => {
    const out = [];
    for (const run of workerData.runs) out.push(await runOne({ ...run, root: workerData.root, fields: workerData.fields }));
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
    const w = new Worker(SELF, { workerData: { root, runs: c, fields: spec.fields } });
    w.once('message', res); w.once('error', rej);
  })));
  writeFileSync(outFile, JSON.stringify(Object.fromEntries(parts.flat())));
  process.exit(0);
} else {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const seeds = Number(opt('seeds', 300));
  const fields = opt('fields', '');
  const jobs = Number(opt('jobs', Math.max(1, Math.floor(cpus().length / 8))));
  const timeoutMs = Number(opt('timeout', 3600)) * 1000;
  const bootRoot = resolve(HERE, '..', '..');
  const tmp = mkdtempSync(join(tmpdir(), 'pair-'));
  let baseWorktree = null;
  let code = 0;
  try {
    let a = opt('a');
    const b = resolve(opt('b', bootRoot));
    if (!a) {
      execFileSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: b, stdio: 'ignore' });
      baseWorktree = join(tmp, 'base');
      execFileSync('git', ['worktree', 'add', '-q', '--detach', baseWorktree, 'origin/main'], { cwd: b });
      symlinkSync(join(b, 'node_modules'), join(baseWorktree, 'node_modules'));
      a = baseWorktree;
    }
    a = resolve(a);
    if (fields) new Function('r', 's', `return (${fields});`);
    const { BOTS } = await import(pathToFileURL(join(b, 'src/sim/bots.js')).href);
    const bots = opt('bots', Object.keys(BOTS).join(',')).split(',');
    const spec = JSON.stringify({ bots, seeds, jobs, fields });
    const t0 = Date.now();
    const side = (root, name) => new Promise((res) => {
      const out = join(tmp, `${name}.json`);
      const child = spawn(process.execPath, [SELF, '--side', root, '--out', out], { env: { ...process.env, PAIR_SPEC: spec }, stdio: ['ignore', 'inherit', 'inherit'] });
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      child.on('exit', (c) => { clearTimeout(timer); res({ name, code: c, out }); });
    });
    // Wait on both processes, never on a sleep.
    const [sa, sb] = await Promise.all([side(a, 'a'), side(b, 'b')]);
    if (sa.code !== 0 || sb.code !== 0) { console.error(`pair: side ${sa.code !== 0 ? 'a' : 'b'} failed (exit ${sa.code !== 0 ? sa.code : sb.code}) or timed out`); code = 2; }
    else {
      const A = JSON.parse(readFileSync(sa.out, 'utf8')), B = JSON.parse(readFileSync(sb.out, 'utf8'));
      const result = compare(A, B);
      console.log(markdown(result, { a: 'a', b: 'b' }));
      console.log(`\n${result.runs} paired runs (${bots.join(', ')}; seeds 1-${seeds}) in ${Math.round((Date.now() - t0) / 1000)} s.`);
      const jf = opt('json');
      if (jf) writeFileSync(jf, JSON.stringify({ a, b, bots, seeds, summary: result.rows.map((r) => ({ ...r, lost: r.lost, gained: r.gained })), runs: { a: A, b: B } }, null, 1));
    }
  } finally {
    if (baseWorktree) { try { execFileSync('git', ['worktree', 'remove', '--force', baseWorktree], { cwd: resolve(opt('b', bootRoot)), stdio: 'ignore' }); } catch { /* left in tmp */ } }
    rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
}
