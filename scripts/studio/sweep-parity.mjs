#!/usr/bin/env node
// Do two sweep runs give the same rows? Compares two report.json files (blender/checks/sweep.mjs --out):
// a row is one distinct violation (its key names the check and the two things), and it matches when both
// runs have it with values within --tolerance metres (default 0.005). Rows of the checks a run without a
// browser does not make (screen, tooltip; --skip changes the list) are left out of both sides.
//
//   node scripts/studio/sweep-parity.mjs browser/report.json engine/report.json [--tolerance 0.005] [--skip screen,tooltip] [--seeds] [--json out.json]
//
// Rows seen in a seeded game (a state `seed:N:wW`) are left out unless --seeds asks for them: a seeded game's scene
// depends on the game's random stream, which three.js shares (it takes a UUID from Math.random for each object it
// builds), and the engine and the browser build different numbers of objects, so the two play different games.
// The engine is the authority for those rows. Mocks, moments and snapshots are the same in both.
// A shared row also has to be seen in the same states. Exit 1 when a row is in one run only, a shared row's
// values differ, or its states do.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { tolerance: { type: 'string' }, skip: { type: 'string' }, json: { type: 'string' }, seeds: { type: 'boolean' } } });
if (positionals.length !== 2) { console.error('usage: sweep-parity.mjs <report.json> <report.json> [--tolerance 0.005] [--skip screen,tooltip] [--seeds] [--json out.json]'); process.exit(2); }
const tolerance = Number(values.tolerance ?? 0.005);
const skip = new Set((values.skip ?? 'screen,tooltip').split(',').filter(Boolean));
const seeded = [];
const inSeed = (v) => (v.states ?? [v.state]).some((st) => /^seed:/.test(st));
const rows = (file) => {
  const all = JSON.parse(readFileSync(file, 'utf8')).violations.filter((v) => !skip.has(v.check));
  const kept = values.seeds ? all : all.filter((v) => !inSeed(v));
  seeded.push(all.length - kept.length);
  return new Map(kept.map((v) => [v.key, v]));
};
const [a, b] = positionals.map(rows);

const out = { tolerance, match: [], onlyFirst: [], onlySecond: [], differ: [], states: [] };
for (const [key, x] of a) {
  const y = b.get(key);
  if (!y) out.onlyFirst.push({ key, value: x.value, state: x.state });
  else if (Math.abs(x.value - y.value) > tolerance) out.differ.push({ key, first: x.value, second: y.value, state: x.state });
  else {
    out.match.push(key);
    // The same row seen in the same states, not only at the same worst depth.
    const only = (p, q) => p.filter((s) => !q.includes(s));
    const gone = only(x.states, y.states), added = only(y.states, x.states);
    if (gone.length || added.length) out.states.push({ key, firstOnly: gone, secondOnly: added });
  }
}
for (const [key, y] of b) if (!a.has(key)) out.onlySecond.push({ key, value: y.value, state: y.state });

const show = (label, list, f) => { for (const r of list) console.log(`${label.padEnd(12)} ${f(r)}`); };
show('first only', out.onlyFirst, (r) => `${r.key}  ${r.value} m at ${r.state}`);
show('second only', out.onlySecond, (r) => `${r.key}  ${r.value} m at ${r.state}`);
show('differ', out.differ, (r) => `${r.key}  first ${r.first} m, second ${r.second} m at ${r.state}`);
show('states', out.states, (r) => `${r.key}  first only: ${r.firstOnly.join(', ') || '-'}; second only: ${r.secondOnly.join(', ') || '-'}`);
console.log(`sweep-parity: ${out.match.length} of ${a.size} rows match within ${tolerance} m; ${out.onlyFirst.length} in the first run only, ${out.onlySecond.length} in the second only, ${out.differ.length} differ, ${out.states.length} seen in different states (skipping ${[...skip].join(', ') || 'nothing'}${values.seeds ? '' : `; ${Math.max(...seeded)} rows seen in seeded games left out, --seeds compares them`})`);
if (values.json) writeFileSync(values.json, JSON.stringify(out, null, 1));
process.exit(out.onlyFirst.length || out.onlySecond.length || out.differ.length || out.states.length ? 1 : 0);
