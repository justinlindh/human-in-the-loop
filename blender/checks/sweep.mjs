// Scene integrity sweep (issue #352): walks real states and checks that the world is physically
// sane, with accurate mesh tests (intersect.js) on states from the sampler (sample.js).
//
//   node blender/checks/sweep.mjs            fast mode: the mocks and one seeded game, briefly,
//                                            every staged prop on a few desks of two mocks, and
//                                            every moment played on purpose in the floor mock,
//                                            and every item against its sim footprint
//   node blender/checks/sweep.mjs --full     every mock for longer, several seeds, sampled often
//   options: --seeds 1,2,3|none  --mocks floor,hq|none  --out <dir>  --timeout <s>  --gpu
//            --seed-limit <s> (per seed: 300 fast, 1200 full; a seed past it is skipped and fails)
//            --update-baseline [--prune]  --strict (fail on new seed-only violations in fast mode)
//            --moments 'printer_jam --choice 0; open_plan_office --stage hq'  indexed moments
//                     (scripts/events/find.js queries), each loaded from its snapshot and played
//
// Checks:
//   overlap  two things interpenetrate by more than 1 cm (furniture, desk and floor props, wall
//            prints, walls, columns); value is the depth in metres
//   float    a desk prop, floor prop or piece of furniture hangs more than 1.5 cm above what is
//            under it; value is the gap
//   hand     a prop held in the hand is more than 6 cm from the wrist; value is the gap
//   bounds   something reaches past the room's walls or under the floor; value is how far
//   grid     an item's model reaches more than 3 cm past its sim footprint tiles on a side (the sim
//            gives that room to a neighbour), or a desk's seat is off the sim's chair tile; every
//            item, level and rotation, alone in the floor mock
//   self     something a person holds or carries is more than 1 cm into their own head or torso
//   person   a person's head or torso (and legs, walking) is more than 2 cm inside furniture, a
//            prop, a wall or another person, other than what they are using (their desk, the
//            item they sit on or leave, a moment's desk); checked every 0.2 s along real walks
//
// Each violation prints with its state (mock:<name> or seed:<n>:w<week>), time into the window,
// the two things, and the value. New ones (not in sweep-baseline.json, or clearly worse than its
// entry) fail the run, except that in fast mode those seen only in seeded games are advisory. An
// accepted entry may name the issue tracking it ("issue": n); fix it, then drop the entry. --out
// (default shots/sweep/) gets report.json, report.md (a table for a PR) and a crop of each. --update-baseline rewrites the baseline to
// exactly what this run found. The run is deterministic: it depends only on the code.
import { startHarness, wantGpu } from './harness.mjs';
import { resolveTarget, openAt } from '../../scripts/events/load.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(HERE, 'sweep-baseline.json');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const full = argv.includes('--full');
const MODES = {
  fast: { mocks: ['garage', 'floor', 'hq', 'night'], propMocks: ['floor', 'hq'], propDesks: 3, gridMocks: ['floor'], momentMocks: ['floor'], moments: { open: 10, after: 5, choices: 1 }, mockSeconds: 6, seeds: [1], seedLimit: 300, weeks: 1040, every: 104, seconds: 2, stagedSeconds: 16, maxStaged: 3, step: 1 },
  full: { mocks: ['garage', 'floor', 'hq', 'incident', 'night', 'ending'], propMocks: ['garage', 'floor', 'hq'], propDesks: 8, gridMocks: ['floor'], momentMocks: ['floor', 'hq'], moments: { open: 20, after: 10, choices: 2 }, mockSeconds: 30, seeds: [1, 2, 3, 4], seedLimit: 1200, weeks: 1040, every: 13, seconds: 8, stagedSeconds: 24, maxStaged: 40, step: 0.5 },
};
const M = { ...MODES[full ? 'full' : 'fast'] };
const list = (v) => (v === 'none' ? [] : v.split(',').filter(Boolean));
if (opt('seeds')) M.seeds = list(opt('seeds')).map(Number);
if (opt('mocks')) M.mocks = list(opt('mocks'));
if (opt('seed-limit')) M.seedLimit = Number(opt('seed-limit'));
const outDir = resolve(opt('out', 'shots/sweep'));
const timeout = Number(opt('timeout', full ? 3600 : 600));

const baseline = (() => { try { return JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { return { accepted: [] }; } })();
const known = baseline.accepted.map((b) => b.key);
// The issue tracking each accepted violation, printed beside it, so it comes out when that is fixed.
const issueOf = new Map(baseline.accepted.filter((b) => b.issue).map((b) => [b.key, b.issue]));

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
    const r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleMock(o), { name, seconds: M.mockSeconds, every: M.step, known, propDesks: M.propMocks.includes(name) ? M.propDesks : 0, moments: M.momentMocks.includes(name) ? M.moments : null, grid: M.gridMocks.includes(name) });
    const vs = r.violations;
    found.push(...vs);
    windows.push(...r.windows);
    errors.push(...e.map((x) => `mock:${name}: ${x}`));
    const played = r.windows.find((w) => w.why === 'moments')?.played;
    if (played) console.log(`sweep: mock:${name} played ${played.length} moments: ${played.join(', ')}`);
    console.log(`sweep: mock:${name} ${vs.length} violation(s) (${Math.round((Date.now() - t0) / 1000)} s)`);
    await page.close();
  }
  // Indexed moments (scripts/events), each loaded from its snapshot and played through its choice.
  for (const query of (opt('moments') ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const target = resolveTarget({ event: query });
    const row = target.row;
    const label = `event:${row.id}:s${row.seed}${row.bot}w${row.week}`;
    const { page, errors: e } = await openAt(H, target, { width: 1600, height: 1000, quality: 'low' });
    const r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleLoaded(o),
      { label, open: M.stagedSeconds, after: 8, every: M.step, choice: row.choice, known });
    found.push(...r.violations);
    windows.push(...r.windows);
    errors.push(...e.map((x) => `${label}: ${x}`));
    console.log(`sweep: ${label} ${r.violations.length} violation(s) (${Math.round((Date.now() - t0) / 1000)} s)`);
    await page.close();
  }
  // Each seed runs in a browser of its own, with a time limit, so a slow or stuck seed can neither
  // slow the ones after it nor use up the whole run; the page reports the week it has reached.
  for (const seed of M.seeds) {
    const HS = await startHarness({ gpu: wantGpu() });
    const { page, errors: e } = await HS.openScene(`quality=low&seed=${seed}`, { width: 1600, height: 1000 });
    let week = 0;
    page.on('console', (m) => { const w = /^sweep-progress w(\d+)$/.exec(m.text()); if (w) week = Number(w[1]); });
    const s0 = Date.now();
    let limit;
    const r = await Promise.race([
      page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleSeed(o),
        { seed, weeks: M.weeks, every: M.every, seconds: M.seconds, stagedSeconds: M.stagedSeconds, maxStaged: M.maxStaged, step: M.step, known }),
      new Promise((res) => { limit = setTimeout(() => res(null), M.seedLimit * 1000); }),
    ]);
    clearTimeout(limit);
    if (!r) {
      errors.push(`seed:${seed}: not done after ${M.seedLimit} s (at week ${week})`);
      console.log(`sweep: seed:${seed} not done after ${M.seedLimit} s, at week ${week}; skipped`);
      // The page is still busy, and closing would wait for it: end its browser outright.
      HS.browser.process?.()?.kill('SIGKILL');
      await HS.close().catch(() => {});
      continue;
    }
    const vs = r.violations;
    found.push(...vs);
    windows.push(...r.windows);
    console.log(`sweep: seed:${seed} played to week ${r.end.week}${r.end.over ? ` (${r.end.over})` : ''}; windows: ${r.windows.map((w) => `w${w.state.split(':w')[1]} ${w.why}`).join(', ')}`);
    errors.push(...e.map((x) => `seed:${seed}: ${x}`));
    console.log(`sweep: seed:${seed} ${vs.length} violation(s) in ${Math.round((Date.now() - s0) / 1000)} s (${Math.round((Date.now() - t0) / 1000)} s)`);
    await HS.close();
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
// A seeded game replays the sim, so any sim change reshuffles who walks where and which moments
// play. In fast mode a new violation seen only in seeded states is advisory (printed, not failed);
// --full or --strict fails on it too. Mocks and the props pass always count.
const strict = full || argv.includes('--strict');
// Indexed moments come from seeded games too, so they count as seed findings.
const seedOnly = (v) => v.states.every((s) => s.startsWith('seed:') || s.startsWith('event:'));
const fresh = [], advisory = [];
for (const v of all) {
  const isNew = !known.includes(v.key) || worse(v);
  if (isNew) (strict || !seedOnly(v) ? fresh : advisory).push(v);
  let shot = '';
  if (v.crop) {
    const file = `${outDir}/${v.key.replace(/[^a-z0-9_-]+/gi, '_')}.png`;
    writeFileSync(file, Buffer.from(v.crop.split(',')[1], 'base64'));
    shot = ` crop ${file}`;
  }
  console.log(`SWEEP ${isNew ? `${worse(v) ? 'WORSE' : 'NEW '}${advisory.includes(v) ? ' (seed, advisory)' : ''}` : 'base'} ${v.check} ${v.detail ?? `${v.a} ~ ${v.b}`} ${v.value} m at ${v.state} t=${v.t}s ${JSON.stringify(v.at)} x${v.count} in ${v.states.length} state(s)${issueOf.has(v.key) ? ` (#${issueOf.get(v.key)})` : ''}${shot}`);
}
// status: baseline, new (fails), or advisory (new, seen only in seeded games, fast mode). Every
// check measures render output, so art owns what it finds.
const status = (v) => (fresh.includes(v) ? 'new' : advisory.includes(v) ? 'advisory' : 'baseline');
writeFileSync(`${outDir}/report.json`, JSON.stringify({ windows, violations: all.map(({ crop, ...v }) => ({ ...v, status: status(v), owner: 'art' })) }, null, 1));
// The same as a markdown table, for a PR comment (crops are named by file, not path).
const md = ['| check | what | value (m) | state | t (s) | status | crop |', '|---|---|---|---|---|---|---|'];
for (const v of all) md.push(`| ${v.check} | ${v.detail ?? `${v.a} ~ ${v.b}`} | ${v.value} | ${v.state} | ${v.t} | ${known.includes(v.key) && !worse(v) ? 'baseline' : 'NEW'} | ${v.crop ? `${v.key.replace(/[^a-z0-9_-]+/gi, '_')}.png` : ''} |`);
writeFileSync(`${outDir}/report.md`, md.join('\n') + '\n');
const gone = known.filter((k) => !byKey.has(k));
// A narrowed run (--mocks, --seeds, --moments) sees only part of the baseline, so only a full run
// lists what it did not see.
if (!opt('mocks') && !opt('seeds') && !opt('moments')) for (const k of gone) console.log(`sweep: baseline entry not seen this run: ${k}`);

// Updating keeps accepted entries this run did not see (a seeded moment may not come up every
// time) unless --prune is given; an entry seen again takes the larger worst value.
if (argv.includes('--update-baseline')) {
  const seen = new Map(all.map((v) => [v.key, { key: v.key, worst: v.value, state: v.state }]));
  const kept = argv.includes('--prune') ? [] : baseline.accepted.filter((b) => !seen.has(b.key));
  // An entry seen again keeps its larger worst value and anything else it carries (its issue).
  for (const b of baseline.accepted) if (seen.has(b.key)) { const e = seen.get(b.key); Object.assign(e, { ...b, ...e, worst: Math.max(e.worst, b.worst) }); }
  const accepted = [...kept, ...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(BASELINE, JSON.stringify({ accepted }, null, 1) + '\n');
  console.log(`sweep: baseline written with ${accepted.length} entries (${kept.length} kept from before)`);
}
if (errors.length) console.log(`sweep: page errors: ${errors.slice(0, 5).join('; ')}`);
console.log(`sweep: ${all.length} distinct violation(s), ${fresh.length} new, ${advisory.length} new in seeds only (advisory), ${gone.length} not seen; ${Math.round((Date.now() - t0) / 1000)} s (${full ? 'full' : 'fast'}${strict ? ', strict' : ''})`);
process.exit(fresh.length && !argv.includes('--update-baseline') || errors.length ? 1 : 0);
