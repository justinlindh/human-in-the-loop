// Headless balance harness: node scripts/balance.js --seeds 100 [--bots balanced,sensible]
// crises = unrecoverable outages plus bridge loans taken. Prints an era-by-era table after the main one.
import { runBot, BOTS } from '../src/sim/bots.js';
import { B } from '../src/sim/balance.js';
import { trackRun } from './lib/timing.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ERA_STARTS } from '../src/data/era-modes.js';
import { EARLY_ORDER } from '../src/data/early-eras.js';
import { ERA_IDS } from '../src/data/eras.js';
import { compare, markdown } from './events/pair-report.js';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const seeds = Number(arg('seeds', 100));
const bots = arg('bots', Object.keys(BOTS).join(',')).split(',');
const startEra = arg('start-era', 'classic');
const json = arg('json', null);
const baseline = arg('baseline', null);
const fail = (message) => { console.error(`balance: ${message}`); process.exit(2); };
if (!Number.isSafeInteger(seeds) || seeds < 1) fail('--seeds must be a positive whole number');
if (!Object.hasOwn(ERA_STARTS, startEra)) fail(`unknown starting era: ${startEra}`);
if (bots.some((bot) => !Object.hasOwn(BOTS, bot))) fail('unknown bot');
let base;
if (baseline) {
  try { base = JSON.parse(readFileSync(baseline, 'utf8')); } catch { fail('cannot read baseline JSON'); }
  if (!base?.runs || typeof base.runs !== 'object') fail('baseline must contain runs');
}
trackRun('balance', { seeds, bots: bots.join(','), startEra });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const rows = [];
const all = {};
const runs = {};
for (const name of bots) {
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const r = runBot(name, seed, undefined, { founding: { startEra } });
    results.push(r);
    runs[`${name}:${seed}`] = {
      reason: r.reason, exited: r.exited, won: r.won, weeks: r.weeks, score: r.score,
      incidents: r.incidents, caught: r.state.stats.caught, breaches: r.state.stats.breaches,
      hash: createHash('sha256').update(JSON.stringify(r.state)).digest('hex'),
    };
  }
  all[name] = results;
  const reasons = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  rows.push({
    bot: name,
    exit: `${Math.round((100 * results.filter((r) => r.exited).length) / seeds)}%`,
    floor: median(results.map((r) => r.stageWeeks[1] ?? 9999)),
    hqWeek: median(results.map((r) => r.stageWeeks[2] ?? 9999)),
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '),
    weeks: median(results.map((r) => r.weeks)),
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
console.log(`seeds per bot: ${seeds}, start: ${startEra}, through the career checkpoint`);
console.table(rows);

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
if (json) writeFileSync(json, JSON.stringify({ startEra, seeds, bots, runs }, null, 2));
if (base) {
  const paired = compare(base.runs, runs);
  if (paired.onlyA.length || paired.onlyB.length) fail('baseline and run seed sets differ');
  console.log(markdown(paired, { a: base.startEra, b: startEra }));
}
