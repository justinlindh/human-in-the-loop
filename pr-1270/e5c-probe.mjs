import { runBot, BOTS } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [era, count, mult, out, selected] = process.argv.slice(2);
if (mult !== 'default') B.eraStarts[era].exitMrrMult = Number(mult);
const bots = selected ? selected.split(',') : Object.keys(BOTS);
const runs = {};
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
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
  console.log(JSON.stringify({ era, mult: B.eraStarts[era].exitMrrMult ?? 1, bot, seeds: rows.length,
    exits: rows.filter((r) => r.exited).length, median: median(rows.map((r) => r.score)),
    dotcom: rows.filter((r) => r.eras.dotcom).length, web2: rows.filter((r) => r.eras.web2).length }));
}
const result = { era, seeds: Number(count), config: { ...B.eraStarts[era] }, bots, runs };
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`pooled median: ${median(Object.values(runs).map((r) => r.score))}`);
