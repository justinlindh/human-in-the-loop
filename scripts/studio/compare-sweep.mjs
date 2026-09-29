#!/usr/bin/env node
// Does the studio engine give the scene sweep's collision rows on the same scene? Loads a compose file into the
// engine, then computes people-against-the-world rows two ways on the same frame: the sweep's own check
// (blender/checks/intersect.js: bodies, people, crossOverlaps, the tolerance sweep.mjs uses for people) and the
// engine's `depthM` intersections. A row matches when the same person part and item overlap by depths within
// --tolerance metres (default 0.005). Exit 1 when a sweep row has no matching engine row, or the reverse.
//   node scripts/studio/compare-sweep.mjs --compose file.json [--frame 30] [--tolerance 0.005] [--json out.json] [--detail]
//   --detail lists every sweep row and every engine row of the scene before the comparison.
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: { compose: { type: 'string' }, frame: { type: 'string' }, tolerance: { type: 'string' }, json: { type: 'string' }, detail: { type: 'boolean' } } });
if (!values.compose) { console.error('usage: compare-sweep.mjs --compose file.json [--frame 30] [--tolerance 0.005] [--json out.json]'); process.exit(2); }
const TOL_PERSON = 0.02;   // sweep.mjs's tolerance for people
const tolerance = Number(values.tolerance ?? 0.005), frame = Number(values.frame ?? 30);

// The compose file compiles in its own process: the engine's module loader must see src/render first.
const compiled = spawnSync(process.execPath, [fileURLToPath(new URL('./compose.mjs', import.meta.url)), values.compose, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
if (compiled.status !== 0) { console.error(compiled.stderr); process.exit(2); }
const { state, script } = JSON.parse(compiled.stdout);

const { createRuntime } = await import('./runtime.mjs');
const { depthAtTol } = await import('./geometry.mjs');
const rt = await createRuntime({ state, script });
rt.stepTo(frame);
const X = await import('../../blender/checks/intersect.js');
const model = await rt.loadMeasurements();
const { R, S } = rt;

const list = X.bodies(R), ps = X.people(R, list);
const skip = (A, B) => { const [p, w] = A.kind === 'person' ? [A, B] : [B, A]; return w.kind !== 'person' && p.own.has(w.key); };
const sweep = [];
for (const o of X.crossOverlaps(ps, list, { tol: TOL_PERSON, skip })) {
  const [p, w] = o.a.kind === 'person' ? [o.a, o.b] : [o.b, o.a];
  for (const q of o.parts) sweep.push({ person: p.id, item: w.id ?? w.label, part: o.a === p ? q.a : q.b, depth: q.depth });
}
const key = (r) => `${r.person}|${r.item}|${r.part}`;
const best = (rows) => { const m = new Map(); for (const r of rows) m.set(key(r), Math.max(m.get(key(r)) ?? 0, r.depth)); return m; };

const scene = model.sampleScene(R, S, { frame, facts: ['intersections'] });
const engine = [];
for (const c of scene.facts.intersections) {
  if (typeof c.depthM !== 'number') continue;
  const [a, b] = [c.a, c.b];
  const person = [a, b].find((x) => x.startsWith('person:')), item = [a, b].find((x) => x.startsWith('item:'));
  if (!person || !item) continue;
  const part = /\/(head|torso|legL|legR):\d+$/.exec(person)?.[1];
  if (part) engine.push({ person: person.split('/')[0].slice(7), item: item.split('/')[0].slice(5), part, depth: depthAtTol(c, TOL_PERSON) });
}
if (values.detail) {
  const short = (id) => id.replace(/Group:\d+\//g, '');
  for (const r of sweep) console.log('sweep ', key(r), r.depth.toFixed(4));
  for (const c of scene.facts.intersections) console.log('engine', short(c.a), '|', short(c.b), typeof c.depthM === 'number' ? c.depthM.toFixed(4) : c.depthM);
}
const s = best(sweep), e = best(engine);
const rows = [], problems = [];
for (const k of new Set([...s.keys(), ...[...e.keys()].filter((x) => (e.get(x) > TOL_PERSON) && /\|(head|torso)$/.test(x))])) {
  const sd = s.get(k) ?? null, ed = e.get(k) ?? null;
  const ok = sd != null && ed != null && Math.abs(sd - ed) <= tolerance;
  rows.push({ pair: k, sweepM: sd, engineM: ed, match: ok });
  if (!ok) problems.push(`${k}: sweep ${sd?.toFixed(4) ?? 'none'} m, engine ${ed?.toFixed(4) ?? 'none'} m`);
}
for (const r of rows) console.log(`${r.match ? 'MATCH' : 'DIFF '} ${r.pair}  sweep ${r.sweepM?.toFixed(4) ?? '-'}  engine ${r.engineM?.toFixed(4) ?? '-'}`);
console.log(rows.length ? `compare-sweep: ${rows.filter((r) => r.match).length} of ${rows.length} rows match within ${tolerance} m` : 'compare-sweep: no collision rows in this scene');
if (values.json) writeFileSync(values.json, JSON.stringify({ frame, tolerance, rows }, null, 1));
process.exit(problems.length ? 1 : 0);
