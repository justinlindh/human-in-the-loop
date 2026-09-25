// Sim tick cost: plays seeded games with a bot and times tick() alone, bucketed by week.
// node scripts/perf/sim.js [--seeds 5] [--weeks 520] [--bot sensible] [--json out.json]
// Prints one line per week bucket: median and p95 microseconds per tick across all seeds.
import { writeFileSync } from 'node:fs';
import { createGame, tick } from '../../src/sim/index.js';
import { botDecide, botTurn } from '../../src/sim/bots.js';
import { arg, quantile } from './stats.js';

const seeds = Number(arg('seeds', 5));
const maxWeeks = Number(arg('weeks', 520));
const bot = arg('bot', 'sensible');
const BUCKET = 52;

const buckets = new Map();
const add = (week, us) => {
  const b = Math.floor(week / BUCKET) * BUCKET;
  if (!buckets.has(b)) buckets.set(b, []);
  buckets.get(b).push(us);
};

// Warm the JIT on one throwaway game so the first seed is not slower than the rest.
{
  const s = createGame({ seed: 999, companyName: 'Warmup' });
  for (let i = 0; i < 60 && !s.gameOver; i++) { botDecide(bot, s); botTurn(bot, s); tick(s); }
}

const ends = [];
for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame({ seed, companyName: `Bot ${bot}` });
  while (!s.gameOver && s.week < maxWeeks) {
    botDecide(bot, s);
    if (s.gameOver) break;
    botTurn(bot, s);
    const week = s.week;
    const t0 = process.hrtime.bigint();
    tick(s);
    add(week, Number(process.hrtime.bigint() - t0) / 1000);
  }
  ends.push(`${seed}:w${s.week}${s.gameOver ? `(${s.gameOver.reason})` : ''}`);
}

const rows = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([w, xs]) => ({
  weeks: `${w}-${w + BUCKET - 1}`, n: xs.length, p50us: Math.round(quantile(xs, 0.5)), p95us: Math.round(quantile(xs, 0.95)), maxus: Math.round(Math.max(...xs)),
}));
const all = [...buckets.values()].flat();
console.log(`sim tick  bot=${bot} seeds=${seeds} weeks<=${maxWeeks}  runs: ${ends.join(' ')}`);
for (const r of rows) console.log(`sim  ${r.weeks.padEnd(9)} n=${String(r.n).padStart(4)}  p50 ${String(r.p50us).padStart(6)}us  p95 ${String(r.p95us).padStart(6)}us  max ${String(r.maxus).padStart(7)}us`);
console.log(`sim  all       n=${String(all.length).padStart(4)}  p50 ${String(Math.round(quantile(all, 0.5))).padStart(6)}us  p95 ${String(Math.round(quantile(all, 0.95))).padStart(6)}us`);
const out = arg('json', null);
if (out) writeFileSync(out, JSON.stringify({ bot, seeds, maxWeeks, rows }, null, 2));
