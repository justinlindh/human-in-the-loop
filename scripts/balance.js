// Headless balance harness: node scripts/balance.js --seeds 100 [--bots balanced,sensible] [--jobs 4] [--set path=value]
// crises = unrecoverable outages plus bridge loans taken. Prints an era-by-era table after the main one.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runBot, BOTS } from '../src/sim/bots.js';
import { B } from '../src/sim/balance.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ERA_STARTS } from '../src/data/era-modes.js';
import { EARLY_ORDER } from '../src/data/early-eras.js';
import { ERA_IDS } from '../src/data/eras.js';

// Bots run in parallel worker threads by default, a few at a time so a run stays polite on a shared machine.
const DEFAULT_JOBS = 3;

// --set eraStarts.plateau.exitMrrMult=0.6 overrides one number in B for this run (repeatable).
function applySets(sets) {
  for (const [path, value] of sets) {
    const keys = path.split('.');
    let obj = B;
    for (const k of keys.slice(0, -1)) obj = obj?.[k];
    const last = keys.at(-1);
    if (!obj || typeof obj[last] !== 'number') throw new Error(`--set ${path}: not a number in B`);
    obj[last] = value;
  }
}

// One bot over the seeds; only what the tables and the JSON need, so it can cross a thread.
function runSeeds(name, seeds, startEra, startMode) {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const r = runBot(name, seed, undefined, { founding: { startEra, startMode } });
    const mult = r.state.founding?.eraScoreMult ?? 1;
    out.push({
      exited: r.exited, won: r.won, reason: r.reason, weeks: r.weeks, score: r.score, raw: r.score / (mult || 1),
      elapsedWeeks: r.weeks - (r.state.founding?.takeoverWeek ?? 0),
      peakMrr: r.peakMrr, maxStage: r.maxStage, firstLaunch: r.firstLaunch, stageWeeks: r.stageWeeks, eras: r.eras,
      resignations: r.resignations, incidents: r.incidents, crises: r.crises,
      caught: r.state.stats.caught, breaches: r.state.stats.breaches,
      hash: createHash('sha256').update(JSON.stringify(r.state)).digest('hex'),
    });
  }
  return out;
}

if (!isMainThread) {
  applySets(workerData.sets);
  parentPort.postMessage(runSeeds(workerData.name, workerData.seeds, workerData.startEra, workerData.startMode));
} else {
  await main();
}

async function main() {
  const { trackRun } = await import('./lib/timing.js');
  const { compare, markdown } = await import('./events/pair-report.js');
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
  const fail = (message) => { console.error(`balance: ${message}`); process.exit(2); };
  const seeds = Number(arg('seeds', 100));
  const bots = arg('bots', Object.keys(BOTS).join(',')).split(',');
  const startEra = arg('start-era', 'classic');
  const startMode = arg('start-mode', 'garage');
  const json = arg('json', null);
  const baseline = arg('baseline', null);
  const jobs = Number(arg('jobs', DEFAULT_JOBS));
  const sets = args.flatMap((a, i) => (a === '--set' ? [args[i + 1] ?? ''] : [])).map((s) => {
    const [path, value] = s.split('=');
    if (!path || value === undefined || value === '' || !Number.isFinite(Number(value))) fail(`--set wants path=number, got ${s}`);
    return [path, Number(value)];
  });
  if (!Number.isSafeInteger(seeds) || seeds < 1) fail('--seeds must be a positive whole number');
  if (!Number.isSafeInteger(jobs) || jobs < 1) fail('--jobs must be a positive whole number');
  if (!Object.hasOwn(ERA_STARTS, startEra)) fail(`unknown starting era: ${startEra}`);
  if (!['garage', 'takeover'].includes(startMode)) fail('unknown starting mode');
  if (startMode === 'takeover' && !Object.hasOwn(B.takeover.scoreMult, startEra)) fail('takeover requires ChatGBT or Agents');
  if (bots.some((bot) => !Object.hasOwn(BOTS, bot))) fail('unknown bot');
  try { applySets(sets); } catch (e) { fail(e.message); }
  let base;
  if (baseline) {
    try { base = JSON.parse(readFileSync(baseline, 'utf8')); } catch { fail('cannot read baseline JSON'); }
    if (!base?.runs || typeof base.runs !== 'object') fail('baseline must contain runs');
  }
  trackRun('balance', { seeds, bots: bots.join(','), startEra, startMode });

  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const all = {};
  if (jobs === 1) {
    for (const name of bots) all[name] = runSeeds(name, seeds, startEra, startMode);
  } else {
    const queue = [...bots];
    const worker = async () => {
      while (queue.length) {
        const name = queue.shift();
        all[name] = await new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { name, seeds, startEra, startMode, sets } });
          w.once('message', resolve);
          w.once('error', reject);
          w.once('exit', (code) => { if (code) reject(new Error(`worker ${name} exited with ${code}`)); });
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, bots.length) }, worker));
  }

  const rows = [];
  const runs = {};
  for (const name of bots) {
    const results = all[name];
    results.forEach((r, i) => {
      runs[`${name}:${i + 1}`] = {
        reason: r.reason, exited: r.exited, won: r.won, weeks: r.weeks, score: r.score,
        incidents: r.incidents, caught: r.caught, breaches: r.breaches, elapsedWeeks: r.elapsedWeeks, hash: r.hash,
      };
    });
    const reasons = {};
    for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    rows.push({
      bot: name,
      exit: `${Math.round((100 * results.filter((r) => r.exited).length) / seeds)}%`,
      floor: median(results.map((r) => r.stageWeeks[1] ?? 9999)),
      hqWeek: median(results.map((r) => r.stageWeeks[2] ?? 9999)),
      reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '),
      weeks: median(results.map((r) => r.weeks)),
      playedWeeks: median(results.map((r) => r.elapsedWeeks)),
      firstLaunch: median(results.map((r) => r.firstLaunch ?? 999)),
      pastOpening: `${Math.round(100 * results.filter((r) => r.weeks > B.preinternet.weeks).length / seeds)}%`,
      peakMrr: fmt(median(results.map((r) => r.peakMrr))),
      score: fmt(median(results.map((r) => r.score))),
      hq: `${Math.round((100 * results.filter((r) => r.maxStage === 2).length) / seeds)}%`,
      resign: median(results.map((r) => r.resignations)),
      incidents: median(results.map((r) => r.incidents)),
      crises: median(results.map((r) => r.crises)),
    });
  }
  console.log(`seeds per bot: ${seeds}, start: ${startEra}/${startMode}, through the career checkpoint${sets.length ? `, set ${sets.map(([p, v]) => `${p}=${v}`).join(' ')}` : ''}`);
  console.table(rows);
  const pooled = bots.flatMap((name) => all[name]);
  console.log(`pooled median score ${fmt(median(pooled.map((r) => r.score)))}, before the era factor ${fmt(median(pooled.map((r) => r.raw)))}`);

  // Era by era after the starting one: how many runs reached each era, and median cash, staff, and MRR on arrival.
  // From an early start, reaching the next chapter means surviving the one before it (the dot-com bust, say).
  const timeline = [...EARLY_ORDER, ...ERA_IDS];
  const eraRows = [];
  for (const name of bots) {
    for (const era of timeline.slice(timeline.indexOf(startEra) + 1)) {
      const at = all[name].map((r) => r.eras[era]).filter(Boolean);
      eraRows.push({
        bot: name, era, reached: `${Math.round((100 * at.length) / seeds)}%`,
        cash: fmt(median(at.map((e) => e.cash))), staff: median(at.map((e) => e.staff)), mrr: fmt(median(at.map((e) => e.mrr))),
      });
    }
  }
  console.table(eraRows);
  if (json) writeFileSync(json, JSON.stringify({ startEra, startMode, seeds, bots, runs }, null, 2));
  if (base) {
    const paired = compare(base.runs, runs);
    if (paired.onlyA.length || paired.onlyB.length) fail('baseline and run seed sets differ');
    console.log(markdown(paired, { a: `${base.startEra}/${base.startMode ?? 'garage'}`, b: `${startEra}/${startMode}` }));
  }
}
