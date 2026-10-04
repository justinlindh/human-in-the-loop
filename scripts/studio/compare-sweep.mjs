#!/usr/bin/env node
// Does the studio engine give the scene sweep's collision rows? Two ways of running the same comparison on
// composed scenes: the sweep's own people-against-furniture rows (blender/checks/intersect.js: bodies, people,
// crossOverlaps, sweep.mjs's tolerance for people) and the engine's `depthM` intersections, on the same frame.
// A pair is a person's head or torso and one part of an item (its material name, as the sweep names it). It
// matches when both sides have it with depths within --tolerance metres (default 0.005). Exit 1 when the sweep
// finds a pair the engine misses, or the depths on a shared pair differ; extra engine pairs are reported only.
//
//   node scripts/studio/compare-sweep.mjs --compose file.json [--frame 30] [--detail]
//       the scene in one compose file
//   node scripts/studio/compare-sweep.mjs --grid coffee_corner,desk,plant,whiteboard [--positions 20] [--json out.json]
//       each item alone, a standing person at a lattice of positions round and inside its footprint
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { makeTemp } from '../tools/tmp.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { values } = parseArgs({ options: { compose: { type: 'string' }, grid: { type: 'string' }, positions: { type: 'string' }, frame: { type: 'string' }, tolerance: { type: 'string' }, json: { type: 'string' }, detail: { type: 'boolean' } } });
if (!values.compose && !values.grid) { console.error('usage: compare-sweep.mjs --compose file.json [--frame 30] [--detail] | --grid coffee_corner,desk,... [--positions 20]  [--tolerance 0.005] [--json out.json]'); process.exit(2); }
const TOL_PERSON = 0.02;   // sweep.mjs's tolerance for people
const tolerance = Number(values.tolerance ?? 0.005), frame = Number(values.frame ?? 30);
const scratch = makeTemp('compare-sweep-');
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

// A compose file compiles in its own process: the engine's module loader must see src/render first.
function compile(file) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./compose.mjs', import.meta.url)), file, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stderr); process.exit(2); }
  return JSON.parse(r.stdout);
}

const { createRuntime } = await import('./runtime.mjs');
const X = await import('../../blender/checks/intersect.js');
const { partId } = await import('./ids.mjs');
const { depthAtTol } = await import('./geometry.mjs');

// The sweep names an item part by its material, as intersect.js's partName does.
const partName = (m) => {
  if (m.userData.part) return m.userData.part;
  const n = (Array.isArray(m.material) ? m.material[0] : m.material)?.name || m.name || 'mesh';
  return /^screen/.test(n) ? 'screen' : /^glow_led/.test(n) ? 'led' : n;
};
const BODY = /^(head|torso)$/;

// Both sides' pairs on the current frame: Map of "person|item|body part|item part" to the deepest overlap.
function pairs(R, S, model) {
  const list = X.bodies(R), ps = X.people(R, list);
  // The sweep's own-furniture rule (a person's seat, the item they use) is a rule on top of the metric, not
  // part of it, so this comparison keeps those pairs.
  const skip = () => false;
  const sweep = new Map(), engine = new Map();
  const put = (m, k, d) => m.set(k, Math.max(m.get(k) ?? 0, d));
  for (const o of X.crossOverlaps(ps, list, { tol: TOL_PERSON, skip })) {
    const [p, w] = o.a.kind === 'person' ? [o.a, o.b] : [o.b, o.a];
    for (const q of o.parts) {
      const [pp, wp] = o.a === p ? [q.a, q.b] : [q.b, q.a];
      if (w.kind === 'placed' && BODY.test(pp)) put(sweep, `${p.id}|${w.id}|${pp}|${wp}`, q.depth);
    }
  }
  const { records } = model.inventory(R, S);
  const byId = new Map();
  for (const r of records) for (const m of r.meshes) byId.set(partId(r.id, m, r.root), m);
  R.scene.updateMatrixWorld();
  const scene = model.sampleScene(R, S, { frame: 0, facts: ['intersections'] });
  for (const c of scene.facts.intersections) {
    if (typeof c.depthM !== 'number') continue;
    const person = [c.a, c.b].find((x) => x.startsWith('person:')), item = [c.a, c.b].find((x) => x.startsWith('item:'));
    if (!person || !item) continue;
    const part = /\/(head|torso):\d+$/.exec(person)?.[1];
    const mesh = byId.get(item);
    if (part && mesh) put(engine, `${person.split('/')[0].slice(7)}|${item.split('/')[0].slice(5)}|${part}|${partName(mesh)}`, depthAtTol(c, TOL_PERSON));
  }
  return { sweep, engine, scene };
}

// What differs between the two: pairs only the sweep has (misses), pairs only the engine has past the sweep's
// tolerance (extras), and shared pairs whose depths differ by more than the tolerance.
function compare({ sweep, engine }) {
  const rows = [], misses = [], extras = [], off = [];
  for (const k of new Set([...sweep.keys(), ...[...engine.keys()].filter((x) => engine.get(x) > TOL_PERSON)])) {
    const sd = sweep.get(k) ?? null, ed = engine.get(k) ?? null;
    const row = { pair: k, sweepM: sd, engineM: ed };
    if (sd != null && ed == null) { row.status = 'MISSED'; misses.push(row); }
    else if (sd == null) { row.status = 'extra'; extras.push(row); }
    else if (Math.abs(sd - ed) > tolerance) { row.status = 'DIFF'; off.push(row); }
    else row.status = 'match';
    rows.push(row);
  }
  return { rows, misses, extras, off };
}
const fmt = (v) => (v == null ? '-' : v.toFixed(4));

if (values.compose) {
  const { state, script } = compile(values.compose);
  const rt = await createRuntime({ state, script });
  rt.stepTo(frame);
  const model = await rt.loadMeasurements();
  const found = pairs(rt.R, rt.S, model);
  if (values.detail) {
    const short = (id) => id.replace(/Group:\d+\//g, '');
    for (const [k, d] of found.sweep) console.log('sweep ', k, fmt(d));
    for (const c of found.scene.facts.intersections) console.log('engine', short(c.a), '|', short(c.b), typeof c.depthM === 'number' ? fmt(c.depthM) : c.depthM);
  }
  const r = compare(found);
  for (const row of r.rows) console.log(`${row.status.padEnd(6)} ${row.pair}  sweep ${fmt(row.sweepM)}  engine ${fmt(row.engineM)}`);
  console.log(r.rows.length ? `compare-sweep: ${r.rows.filter((x) => x.status === 'match').length} of ${r.rows.length} pairs match within ${tolerance} m; ${r.misses.length} missed by the engine, ${r.off.length} differ, ${r.extras.length} engine-only` : 'compare-sweep: no collision pairs in this scene');
  if (values.json) writeFileSync(values.json, JSON.stringify({ scene: values.compose, tolerance, ...r }, null, 1));
  process.exit(r.misses.length || r.off.length ? 1 : 0);
}

// The grid: one runtime per item, the person stood at each lattice position in turn.
const { stageLayout } = await import('../../src/render/layout.js');
const { ITEMS } = await import('../../src/data/items.js');
const count = Number(values.positions ?? 20);
const AT = [6, 6];
const cols = Math.max(2, Math.round(Math.sqrt(count * 1.25))), rowsN = Math.max(2, Math.ceil(count / cols));
let totals = { positions: 0, pairs: 0, match: 0, misses: 0, off: 0, extras: 0 };
const report = [];
for (const item of values.grid.split(',').map((s) => s.trim()).filter(Boolean)) {
  if (!ITEMS[item]) { console.error(`compare-sweep: unknown item "${item}"`); process.exit(2); }
  const file = join(scratch, `${item}.json`);
  writeFileSync(file, JSON.stringify({ base: 'floor', era: 'agents', items: [{ item, at: AT, id: 'it' }], people: [{ id: 'ada', build: 1, free: true, at: [AT[0] - 1.5, AT[1] + 3], face: 'north' }] }));
  const { state, script } = compile(file);
  const rt = await createRuntime({ state, script });
  const model = await rt.loadMeasurements();
  const { W, D } = stageLayout(rt.S.officeStage, rt.S.office.expansion ?? 0);
  const { w, h } = ITEMS[item].footprint;
  const spots = [];
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) spots.push([AT[0] - 0.4 + (w + 0.8) * (i / (cols - 1)), AT[1] - 0.4 + (h + 0.8) * (j / (rowsN - 1))]);
  const perItem = { positions: 0, pairs: 0, match: 0, misses: [], off: [], extras: [] };
  for (const at of spots.slice(0, Math.max(count, 1))) {
    const x = -W / 2 + at[0], z = -D / 2 + at[1];
    rt.R.standAt('ada', x, z);
    rt.R.catchFor('ada', { anim: 'idle', t: 1e9, goal: { x, z, yaw: Math.PI, anim: 'idle' }, back: true });
    rt.stepTo(rt.frame + 6);
    const r = compare(pairs(rt.R, rt.S, model));
    perItem.positions++;
    perItem.pairs += r.rows.length; perItem.match += r.rows.filter((q) => q.status === 'match').length;
    for (const q of r.misses) perItem.misses.push({ at, ...q });
    for (const q of r.off) perItem.off.push({ at, ...q });
    for (const q of r.extras) perItem.extras.push({ at, ...q });
  }
  console.log(`${item.padEnd(14)} ${perItem.positions} positions, ${perItem.pairs} pairs: ${perItem.match} match, ${perItem.misses.length} missed by the engine, ${perItem.off.length} differ, ${perItem.extras.length} engine-only`);
  for (const q of [...perItem.misses, ...perItem.off].slice(0, 12)) console.log(`  ${q.status.padEnd(6)} at ${q.at.map((v) => v.toFixed(2))} ${q.pair}  sweep ${fmt(q.sweepM)}  engine ${fmt(q.engineM)}`);
  totals = { positions: totals.positions + perItem.positions, pairs: totals.pairs + perItem.pairs, match: totals.match + perItem.match, misses: totals.misses + perItem.misses.length, off: totals.off + perItem.off.length, extras: totals.extras + perItem.extras.length };
  report.push({ item, ...perItem });
}
console.log(`compare-sweep grid: ${totals.positions} positions, ${totals.pairs} pairs: ${totals.match} match, ${totals.misses} sweep pairs missed by the engine, ${totals.off} depth differences over ${tolerance} m, ${totals.extras} engine-only pairs`);
if (values.json) writeFileSync(values.json, JSON.stringify({ tolerance, totals, items: report }, null, 1));
process.exit(totals.misses || totals.off ? 1 : 0);
