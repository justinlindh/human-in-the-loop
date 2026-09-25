// Headless balance harness: node scripts/balance.js --seeds 100 [--bots balanced,sensible]
// crises = unrecoverable outages plus bridge loans taken. Prints an era-by-era table after the main one.
import { runBot, BOTS } from '../src/sim/bots.js';
import { B } from '../src/sim/balance.js';
import { trackRun } from './lib/timing.js';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const seeds = Number(arg('seeds', 100));
const bots = arg('bots', Object.keys(BOTS).join(',')).split(',');
trackRun('balance', { seeds, bots: bots.join(',') });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const rows = [];
const all = {};
for (const name of bots) {
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) results.push(runBot(name, seed));
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
    peakMrr: fmt(median(results.map((r) => r.peakMrr))),
    score: fmt(median(results.map((r) => r.score))),
    hq: `${Math.round((100 * results.filter((r) => r.maxStage === 2).length) / seeds)}%`,
    resign: median(results.map((r) => r.resignations)),
    incidents: median(results.map((r) => r.incidents)),
    crises: median(results.map((r) => r.crises)),
  });
}
console.log(`seeds per bot: ${seeds}, up to ${B.runWeeks} weeks`);
console.table(rows);

// Era by era: how many runs reached each era, and median cash, staff, and MRR on arrival.
const eraRows = [];
for (const name of bots) {
  for (const era of ['chatgbt', 'agents', 'consolidation', 'plateau']) {
    const at = all[name].map((r) => r.eras[era]).filter(Boolean);
    eraRows.push({
      bot: name, era, reached: `${Math.round((100 * at.length) / seeds)}%`,
      cash: fmt(median(at.map((e) => e.cash))), staff: median(at.map((e) => e.staff)), mrr: fmt(median(at.map((e) => e.mrr))),
    });
  }
}
console.table(eraRows);
