import { runBot, BOTS } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [era, price, exitMult, scoreMult, out, selected, count = '200'] = process.argv.slice(2);
if (price !== 'default') B.preinternet.price = Number(price);
if (exitMult !== 'default') B.eraStarts[era].exitMrrMult = Number(exitMult);
if (scoreMult !== 'default') B.eraStarts[era].scoreMult = Number(scoreMult);
const bots = selected && selected !== 'all' ? selected.split(',') : Object.keys(BOTS);
const runs = {};
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;
for (const bot of bots) {
  for (let seed = 1; seed <= Number(count); seed++) {
    const r = runBot(bot, seed, undefined, { founding: { startEra: era } });
    runs[`${bot}:${seed}`] = {
      exited: r.exited, reason: r.reason, weeks: r.weeks, score: r.score,
      eras: r.eras, incidents: r.incidents, caught: r.state.stats.caught,
      breaches: r.state.stats.breaches,
      hash: createHash('sha256').update(JSON.stringify(r.state)).digest('hex'),
    };
  }
  const rows = Object.entries(runs).filter(([k]) => k.startsWith(`${bot}:`)).map(([, r]) => r);
  const arrivals = rows.map((r) => r.eras.dotcom).filter(Boolean);
  console.log(JSON.stringify({ era, price: B.preinternet.price, mult: B.eraStarts[era].exitMrrMult, bot,
    seeds: rows.length, exits: rows.filter((r) => r.exited).length, median: median(rows.map((r) => r.score)),
    dotcom: arrivals.length, web2: rows.filter((r) => r.eras.web2).length,
    cash: median(arrivals.map((e) => e.cash)), staff: median(arrivals.map((e) => e.staff)) }));
}
const result = { era, price: B.preinternet.price, seeds: Number(count), config: { ...B.eraStarts[era] }, bots, runs };
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`pooled median: ${median(Object.values(runs).map((r) => r.score))}`);
