// Headless balance harness: node scripts/balance.js --seeds 100 [--bots balanced,sensible]
import { runBot, BOTS } from '../src/sim/bots.js';

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const seeds = Number(arg('seeds', 100));
const bots = arg('bots', Object.keys(BOTS).join(',')).split(',');

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const rows = [];
for (const name of bots) {
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) results.push(runBot(name, seed));
  const reasons = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  rows.push({
    bot: name,
    win: `${Math.round((100 * results.filter((r) => r.won).length) / seeds)}%`,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '),
    weeks: median(results.map((r) => r.weeks)),
    firstLaunch: median(results.map((r) => r.firstLaunch ?? 999)),
    peakMrr: fmt(median(results.map((r) => r.peakMrr))),
    score: fmt(median(results.map((r) => r.score))),
    hq: `${Math.round((100 * results.filter((r) => r.maxStage === 2).length) / seeds)}%`,
  });
}
console.log(`seeds per bot: ${seeds}`);
console.table(rows);
