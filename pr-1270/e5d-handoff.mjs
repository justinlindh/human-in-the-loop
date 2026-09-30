import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { writeFileSync } from 'node:fs';
const [prices, out] = process.argv.slice(2);
const result = [];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;
for (const price of prices.split(',').map(Number)) {
  B.preinternet.price = price;
  for (const bot of ['balanced', 'sensible']) {
    const runs = [];
    for (let seed = 1; seed <= 200; seed++) {
      const r = runBot(bot, seed, B.preinternet.weeks + B.dotcom.weeks + 1, { founding: { startEra: 'preinternet' } });
      runs.push({ seed, eras: r.eras, reason: r.reason, weeks: r.weeks, gameOver: !!r.state.gameOver });
    }
    const arrivals = runs.map((r) => r.eras.dotcom).filter(Boolean);
    const row = { price, bot, into: arrivals.length,
      through: runs.filter((r) => r.eras.web2 && !r.gameOver).length,
      cash: median(arrivals.map((r) => r.cash)), staff: median(arrivals.map((r) => r.staff)), runs };
    result.push(row);
    console.log(JSON.stringify({ ...row, runs: undefined }));
    writeFileSync(out, JSON.stringify(result, null, 2));
  }
}
