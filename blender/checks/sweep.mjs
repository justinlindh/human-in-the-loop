// Scene integrity sweep (issue #352): walks real states and checks that the world is physically
// sane, with accurate mesh tests (intersect.js) on states from the sampler (sample.js).
//
//   node blender/checks/sweep.mjs            fast mode: the mocks and one seeded game, briefly, and
//                                            every staged prop on a few desks of two mocks
//   node blender/checks/sweep.mjs --full     every mock for longer, several seeds, sampled often
//   options: --seeds 1,2,3|none  --mocks floor,hq|none  --out <dir>  --update-baseline  --timeout <s>  --gpu
//
// Checks:
//   overlap  two things interpenetrate by more than 1 cm (furniture, desk and floor props, wall
//            prints, walls, columns); value is the depth in metres
//   float    a desk prop, floor prop or piece of furniture hangs more than 2 cm above what is
//            under it; value is the gap
//   hand     a prop held in the hand is more than 6 cm from the wrist; value is the gap
//   bounds   something reaches past the room's walls or under the floor; value is how far
//
// Each violation prints with its state (mock:<name> or seed:<n>:w<week>), time into the window,
// the two things, and the value. New ones (not in sweep-baseline.json, or clearly worse than its
// entry) fail the run. --out
// (default shots/sweep/) gets report.json, report.md (a table for a PR) and a crop of each. --update-baseline rewrites the baseline to
// exactly what this run found. The run is deterministic: it depends only on the code.
import { startHarness, wantGpu } from './harness.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(HERE, 'sweep-baseline.json');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const full = argv.includes('--full');
const MODES = {
  fast: { mocks: ['garage', 'floor', 'hq', 'night'], propMocks: ['floor', 'hq'], propDesks: 3, mockSeconds: 6, seeds: [1], weeks: 1040, every: 104, seconds: 2, stagedSeconds: 16, maxStaged: 3, step: 1 },
  full: { mocks: ['garage', 'floor', 'hq', 'incident', 'night', 'ending'], propMocks: ['garage', 'floor', 'hq'], propDesks: 8, mockSeconds: 30, seeds: [1, 2, 3, 4], weeks: 1040, every: 13, seconds: 8, stagedSeconds: 24, maxStaged: 40, step: 0.5 },
};
const M = { ...MODES[full ? 'full' : 'fast'] };
const list = (v) => (v === 'none' ? [] : v.split(',').filter(Boolean));
if (opt('seeds')) M.seeds = list(opt('seeds')).map(Number);
if (opt('mocks')) M.mocks = list(opt('mocks'));
const outDir = resolve(opt('out', 'shots/sweep'));
const timeout = Number(opt('timeout', full ? 3600 : 600));

const baseline = (() => { try { return JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { return { accepted: [] }; } })();
const known = baseline.accepted.map((b) => b.key);

const kill = setTimeout(() => { console.error(`sweep: timed out after ${timeout} s`); process.exit(124); }, timeout * 1000);
const t0 = Date.now();
// Geometry, not pixels: the GPU is fine here when asked for (--gpu or HITL_GPU=1).
const H = await startHarness({ gpu: wantGpu() });
const found = [];
const errors = [];
const windows = [];
try {
  for (const name of M.mocks) {
    const { page, errors: e } = await H.openScene(`quality=low&mock=${name}`, { width: 1600, height: 1000 });
    const r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleMock(o), { name, seconds: M.mockSeconds, every: M.step, known, propDesks: M.propMocks.includes(name) ? M.propDesks : 0 });
    const vs = r.violations;
    found.push(...vs);
    windows.push(...r.windows);
    errors.push(...e.map((x) => `mock:${name}: ${x}`));
    console.log(`sweep: mock:${name} ${vs.length} violation(s) (${Math.round((Date.now() - t0) / 1000)} s)`);
    await page.close();
  }
  for (const seed of M.seeds) {
    const { page, errors: e } = await H.openScene(`quality=low&seed=${seed}`, { width: 1600, height: 1000 });
    const r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleSeed(o),
      { seed, weeks: M.weeks, every: M.every, seconds: M.seconds, stagedSeconds: M.stagedSeconds, maxStaged: M.maxStaged, step: M.step, known });
    const vs = r.violations;
    found.push(...vs);
    windows.push(...r.windows);
    console.log(`sweep: seed:${seed} played to week ${r.end.week}${r.end.over ? ` (${r.end.over})` : ''}; windows: ${r.windows.map((w) => `w${w.state.split(':w')[1]} ${w.why}`).join(', ')}`);
    errors.push(...e.map((x) => `seed:${seed}: ${x}`));
    console.log(`sweep: seed:${seed} ${vs.length} violation(s) (${Math.round((Date.now() - t0) / 1000)} s)`);
    await page.close();
  }
} finally {
  await H.close();
  clearTimeout(kill);
}

// One line per distinct violation (worst occurrence), then the new ones' crops.
const byKey = new Map();
for (const v of found) {
  const p = byKey.get(v.key);
  if (!p) byKey.set(v.key, { ...v, states: [v.state], count: v.seen });
  else {
    p.count += v.seen;
    if (!p.states.includes(v.state)) p.states.push(v.state);
    if (v.value > p.value) Object.assign(p, { ...v, states: p.states, count: p.count, crop: v.crop ?? p.crop });
  }
}
const all = [...byKey.values()].sort((a, b) => a.check.localeCompare(b.check) || b.value - a.value);
mkdirSync(outDir, { recursive: true });
// A baselined violation that got clearly worse counts as new.
const worst = new Map(baseline.accepted.map((b) => [b.key, b.worst]));
const worse = (v) => worst.has(v.key) && v.value > worst.get(v.key) * 1.25 + 0.005;
const fresh = [];
for (const v of all) {
  const isNew = !known.includes(v.key) || worse(v);
  if (isNew) fresh.push(v);
  let shot = '';
  if (v.crop) {
    const file = `${outDir}/${v.key.replace(/[^a-z0-9_-]+/gi, '_')}.png`;
    writeFileSync(file, Buffer.from(v.crop.split(',')[1], 'base64'));
    shot = ` crop ${file}`;
  }
  console.log(`SWEEP ${isNew ? (worse(v) ? 'WORSE' : 'NEW ') : 'base'} ${v.check} ${v.detail ?? `${v.a} ~ ${v.b}`} ${v.value} m at ${v.state} t=${v.t}s ${JSON.stringify(v.at)} x${v.count} in ${v.states.length} state(s)${shot}`);
}
writeFileSync(`${outDir}/report.json`, JSON.stringify({ windows, violations: all.map(({ crop, ...v }) => v) }, null, 1));
// The same as a markdown table, for a PR comment (crops are named by file, not path).
const md = ['| check | what | value (m) | state | t (s) | status | crop |', '|---|---|---|---|---|---|---|'];
for (const v of all) md.push(`| ${v.check} | ${v.detail ?? `${v.a} ~ ${v.b}`} | ${v.value} | ${v.state} | ${v.t} | ${known.includes(v.key) && !worse(v) ? 'baseline' : 'NEW'} | ${v.crop ? `${v.key.replace(/[^a-z0-9_-]+/gi, '_')}.png` : ''} |`);
writeFileSync(`${outDir}/report.md`, md.join('\n') + '\n');
const gone = known.filter((k) => !byKey.has(k));
for (const k of gone) console.log(`sweep: baseline entry no longer found: ${k}`);

if (argv.includes('--update-baseline')) {
  const accepted = all.map((v) => ({ key: v.key, worst: v.value, state: v.state }));
  writeFileSync(BASELINE, JSON.stringify({ accepted }, null, 1) + '\n');
  console.log(`sweep: baseline written with ${accepted.length} entries`);
}
if (errors.length) console.log(`sweep: page errors: ${errors.slice(0, 5).join('; ')}`);
console.log(`sweep: ${all.length} distinct violation(s), ${fresh.length} new, ${gone.length} fixed since the baseline; ${Math.round((Date.now() - t0) / 1000)} s (${full ? 'full' : 'fast'})`);
process.exit(fresh.length && !argv.includes('--update-baseline') || errors.length ? 1 : 0);
