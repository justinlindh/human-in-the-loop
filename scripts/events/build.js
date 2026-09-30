// Build the seeded event index and save-state snapshots for find.js and --moment consumers.
//   node scripts/events/build.js [--seeds 1-20] [--bots balanced,sensible,allHumans]
//     [--weeks 1040] [--jobs N] [--force] [--profile <file.json>]
// Completed indexes live at <cache>/<sim hash>/{events.jsonl.gz,meta.json,snapshots/}.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, mkdtempSync, renameSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { CACHE, simHash, indexDir } from './lib.js';

if (!isMainThread) {
  const { play } = await import('./play.js');
  parentPort.on('message', (run) => parentPort.postMessage(play(run)));
} else {
  try { await build(); }
  catch (err) { console.error(`events: ${err.message}`); process.exitCode = 2; }
}

function options(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === '--force') { values.force = true; continue; }
    if (!['--seeds', '--bots', '--weeks', '--jobs', '--profile'].includes(name)) throw new Error(`unknown option: ${name}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${name} needs a value`);
    values[name.slice(2)] = argv[++i];
  }
  const positive = (value, name) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
    return n;
  };
  const seeds = (values.seeds ?? '1-20').split(',').flatMap((part) => {
    if (!/^\d+(?:-\d+)?$/.test(part)) throw new Error(`invalid seed range: ${part}`);
    const [a, b = a] = part.split('-').map(Number);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b < a || b - a > 100000) throw new Error(`invalid seed range: ${part}`);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
  if (new Set(seeds).size !== seeds.length) throw new Error('seeds must not overlap');
  const bots = (values.bots ?? 'balanced,sensible,allHumans').split(',');
  if (new Set(bots).size !== bots.length || bots.some((b) => !/^[A-Za-z][A-Za-z0-9]*$/.test(b))) throw new Error('bots must be distinct bot names');
  return { ...values, seeds, bots, weeks: positive(values.weeks ?? 1040, '--weeks'), jobs: positive(values.jobs ?? Math.min(8, availableParallelism()), '--jobs') };
}

async function build() {
  const { seeds, bots, weeks, jobs, force, profile } = options(process.argv.slice(2));
  const { BOTS } = await import('../../src/sim/bots.js');
  for (const bot of bots) if (!Object.hasOwn(BOTS, bot)) throw new Error(`unknown bot: ${bot}`);
  const started = performance.now();
  const hash = simHash(), dir = indexDir(hash);
  if (existsSync(join(dir, 'events.jsonl.gz')) && !force) {
    console.log(`events: an index for this code (${hash}) already exists at ${dir}; --force rebuilds it`);
    return;
  }
  mkdirSync(CACHE, { recursive: true });
  const staging = mkdtempSync(join(CACHE, `.build-${hash}-`));
  const backup = `${staging}-previous`;
  const workers = new Set();
  let interrupted = false;
  const cleanup = () => rmSync(staging, { recursive: true, force: true });
  const interrupt = (signal) => {
    if (interrupted) return;
    interrupted = true;
    // Workers write only into the unpublished directory. Stop them before removing it.
    Promise.all([...workers].map((w) => w.terminate())).finally(() => {
      cleanup();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  };
  const onInt = () => interrupt('SIGINT'), onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  try {
    mkdirSync(join(staging, 'snapshots'));
    const runs = bots.flatMap((bot) => seeds.map((seed) => ({ bot, seed, weeks, dir: staging, profile: !!profile })));
    const results = new Array(runs.length);
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(jobs, runs.length) }, async () => {
      const w = new Worker(new URL(import.meta.url));
      workers.add(w);
      try {
        while (next < runs.length) {
          const i = next++;
          results[i] = await new Promise((res, rej) => {
            const clear = () => { w.off('message', message); w.off('error', error); w.off('exit', exit); };
            const message = (result) => { clear(); res(result); };
            const error = (err) => { clear(); rej(err); };
            const exit = (code) => error(new Error(`worker exited before returning a run (${code})`));
            w.once('message', message); w.once('error', error); w.once('exit', exit);
            w.postMessage(runs[i]);
          });
          done++;
          if (done % 10 === 0 || done === runs.length) console.log(`events: ${done}/${runs.length} runs (${Math.round((performance.now() - started) / 1000)} s)`);
        }
      } finally { await w.terminate(); workers.delete(w); }
    }));
    const finish = performance.now();
    const all = results.flatMap((r) => r.rows);
    all.sort((a, b) => a.bot.localeCompare(b.bot) || a.seed - b.seed || a.week - b.week);
    const sorted = performance.now();
    const json = all.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const serialized = performance.now();
    const gz = gzipSync(json);
    const compressed = performance.now();
    writeFileSync(join(staging, 'events.jsonl.gz'), gz);
    const snaps = readdirSync(join(staging, 'snapshots'));
    const bytes = snaps.reduce((n, f) => n + statSync(join(staging, 'snapshots', f)).size, 0);
    writeFileSync(join(staging, 'meta.json'), JSON.stringify({ hash, seeds, bots, weeks, rows: all.length, snapshots: snaps.length, builtAt: new Date().toISOString() }, null, 1));
    // Publish only a complete directory. A forced rebuild keeps the old index readable until here.
    if (existsSync(dir)) renameSync(dir, backup);
    try { renameSync(staging, dir); }
    catch (err) {
      if (existsSync(backup) && !existsSync(dir)) renameSync(backup, dir);
      throw err;
    }
    rmSync(backup, { recursive: true, force: true });
    const io = performance.now() - compressed;
    // Ignore unpublished builds when retaining the three most recent completed indexes.
    const old = readdirSync(CACHE).filter((d) => /^[a-f0-9]{16}$/.test(d) && d !== hash && existsSync(join(CACHE, d, 'meta.json'))).sort((a, b) => statSync(join(CACHE, b)).mtimeMs - statSync(join(CACHE, a)).mtimeMs);
    for (const d of old.slice(2)) rmSync(join(CACHE, d), { recursive: true, force: true });
    if (profile) writeFileSync(resolve(profile), JSON.stringify({ jobs: Math.min(jobs, runs.length), wall: performance.now() - started, runs: results.map((r) => r.profile), final: { sort: sorted - finish, serialization: serialized - sorted, compression: compressed - serialized, io } }, null, 2));
    console.log(`events: ${all.length} rows, ${snaps.length} snapshots (${(bytes / 1e6).toFixed(1)} MB) from ${runs.length} runs in ${Math.round((performance.now() - started) / 1000)} s -> ${dir}`);
  } finally {
    await Promise.all([...workers].map((w) => w.terminate()));
    cleanup();
    if (!interrupted) {
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    }
  }
}
