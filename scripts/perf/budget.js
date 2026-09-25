// Checks a bench.js JSON result against the performance budget; exits 1 on a breach.
// node scripts/perf/budget.js <result.json> [--budget scripts/perf/budget.json]
// The budget file:
//   counts: { "<scene>/<quality>": { calls, triangles, programs, textures, geometries } }
//     ceilings for the last build in the result; renderer counts are deterministic, so these hold
//     on any machine.
//   ratio: { scenes: ["floor/low"], metrics: ["render"], max: 1.4 }
//     with two builds in the result (bench.js --refs base,head), the head's timing in those scenes
//     may be at most max times the base's. Both builds ran interleaved in one invocation, so machine
//     load mostly cancels. The late-game scene plays live and is too noisy to gate on.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { arg } from './stats.js';

const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: node scripts/perf/budget.js <result.json> [--budget file]'); process.exit(2); }
const result = JSON.parse(readFileSync(resolve(file), 'utf8'));
const budget = JSON.parse(readFileSync(resolve(String(arg('budget', 'scripts/perf/budget.json'))), 'utf8'));
const head = result.builds.at(-1);
const base = result.builds.length > 1 ? result.builds[0] : null;
const fails = [];
let checked = 0;

for (const [key, caps] of Object.entries(budget.counts ?? {})) {
  const r = head.scenes[key];
  if (!r) continue;
  for (const [metric, cap] of Object.entries(caps)) {
    checked++;
    if (r[metric] > cap) fails.push(`${key} ${metric} ${Math.round(r[metric])} > budget ${cap}`);
  }
}
if (base && budget.ratio) {
  for (const key of budget.ratio.scenes) {
    const r = head.scenes[key], b = base.scenes[key];
    if (!r || !b) continue;
    for (const metric of budget.ratio.metrics) {
      checked++;
      const ratio = r[metric] / b[metric];
      const line = `${key} ${metric} ${head.label} ${r[metric].toFixed(1)}ms vs ${base.label} ${b[metric].toFixed(1)}ms (x${ratio.toFixed(2)})`;
      if (ratio > budget.ratio.max) fails.push(`${line} > x${budget.ratio.max}`);
      else console.log(`ok   ${line}`);
    }
  }
}
for (const f of fails) console.log(`FAIL ${f}`);
console.log(`budget: ${checked - fails.length}/${checked} within budget`);
process.exit(fails.length ? 1 : 0);
