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
// The engine is the authority for those rows; a row seen in a seeded game and elsewhere is compared on its other states. Mocks, moments and snapshots are the same in both.
// A shared row also has to be seen in the same states. Exit 1 when a row is in one run only, a shared row's
// values differ, or its states do.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { tolerance: { type: 'string' }, skip: { type: 'string' }, json: { type: 'string' }, seeds: { type: 'boolean' } } });
if (positionals.length !== 2) { console.error('usage: sweep-parity.mjs <report.json> <report.json> [--tolerance 0.005] [--skip screen,tooltip] [--seeds] [--json out.json]'); process.exit(2); }
const tolerance = Number(values.tolerance ?? 0.005);
const skip = new Set((values.skip ?? 'screen,tooltip').split(',').filter(Boolean));
const seeded = [];
// A row's value is its worst depth over all its states, so a row seen in both a mock and a seeded game keeps only
// its non-seeded states and is compared on those; its depth is compared only when no seeded state fed it.
const mixedIn = [];
const rows = (file) => {
  const all = JSON.parse(readFileSync(file, 'utf8')).violations.filter((v) => !skip.has(v.check));
  const kept = [];
  for (const v of all) {
    const states = v.states ?? [v.state];
    const plain = values.seeds ? states : states.filter((st) => !/^seed:/.test(st));
    if (!plain.length) continue;
    if (plain.length < states.length) { kept.push({ ...v, states: plain, mixed: true }); } else kept.push({ ...v, states: plain });
  }
  seeded.push(all.length - kept.length);
  mixedIn.push(kept.filter((v) => v.mixed).length);
  return new Map(kept.map((v) => [v.key, v]));
};
const [a, b] = positionals.map(rows);

const out = { tolerance, match: [], onlyFirst: [], onlySecond: [], differ: [], states: [] };
for (const [key, x] of a) {
  const y = b.get(key);
  if (!y) out.onlyFirst.push({ key, value: x.value, state: x.state });
  else if (!x.mixed && !y.mixed && Math.abs(x.value - y.value) > tolerance) out.differ.push({ key, first: x.value, second: y.value, state: x.state });
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
console.log(`sweep-parity: ${out.match.length} of ${a.size} rows match within ${tolerance} m; ${out.onlyFirst.length} in the first run only, ${out.onlySecond.length} in the second only, ${out.differ.length} differ, ${out.states.length} seen in different states (skipping ${[...skip].join(', ') || 'nothing'}${values.seeds ? '' : `; ${Math.max(...seeded)} rows seen only in seeded games left out, ${Math.max(...mixedIn)} seen in both kinds compared on their non-seeded states with depths not compared; --seeds compares them all`})`);
if (values.json) writeFileSync(values.json, JSON.stringify(out, null, 1));
process.exit(out.onlyFirst.length || out.onlySecond.length || out.differ.length || out.states.length ? 1 : 0);
