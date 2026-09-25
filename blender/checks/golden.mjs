// Golden images: a fixed set of close-up renders compared against stored references.
//
//   node blender/checks/golden.mjs            compare; exits 1 if any scene differs
//   node blender/checks/golden.mjs --update   rewrite the references (commit them deliberately)
//   --only=a,b    just these scenes      --jobs=N   scenes rendered at once (default 8)
//
// Scenes render concurrently, each in its own page with its own seeded random and frozen clock, so
// the pixels do not depend on the order or the overlap. A full clean pass is recorded against a
// hash of every input (cache.mjs); a later run with the same inputs skips rendering.
//
// Each scene loads the game through harness.mjs (Math.random seeded, the clock frozen, the game
// loop held) and steps a fixed number of frames by hand, so a render depends only on the code.
// Differences are counted per pixel (any channel off by more than CHANNEL_TOL); a scene fails when
// more than MAX_SHARE of pixels differ. Failures write <scene>.actual.png and <scene>.diff.png next to the reference.
import { startHarness } from './harness.mjs';
import { inputHash, passedAt, recordPass } from './cache.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, 'golden');
const OUT = resolve(HERE, '..', '..', 'shots', 'golden');
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const JOBS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--jobs='))?.slice(7)) || 8);
const CHANNEL_TOL = 24;
const MAX_SHARE = 0.004;
const W = 960, H_PX = 640;

// The page setup for a scene: query string, then a script run after the game is ready.
const MOODS = `(m) => { const S = __HITL.state; S.staff.forEach((p, i) => { const k = m[i % m.length]; if (k === 'tired') { p.mood = 'ok'; p.stamina = 10; } else { p.mood = k; p.stamina = 80; } p.assignment = { type: 'project', targetId: null }; }); }`;
const SCENES = [
  { name: 'char-lineup', query: 'chars=1', steps: 20 },
  { name: 'prop-lineup', query: 'props=1', steps: 4 },
  { name: 'item-lineup', query: 'items=1', steps: 4 },
  { name: 'desk-typing', query: 'mock=floor', setup: `(${MOODS})(['ok']); __focus = 0;`, steps: 45, zoom: 4.2 },
  { name: 'desk-moods', query: 'mock=floor', setup: `(${MOODS})(['coasting', 'burnout', 'tired']); __focus = 1;`, steps: 45, zoom: 3.2 },
  { name: 'couch-nap', query: 'mock=floor', setup: `__HITL.state.office.placed.push({ id: 'g_couch', itemId: 'couch', level: 1, x: 1, y: 9, rot: 0 }); __nap = 'g_couch';`, steps: 60, zoom: 4.2 },
  { name: 'nap-pod', query: 'mock=floor', setup: `__HITL.state.office.placed.push({ id: 'g_pod', itemId: 'nap_pod', level: 2, x: 3, y: 9, rot: 0 }); __nap = 'g_pod';`, steps: 60, zoom: 4.2 },
  // Turnarounds of hair, accessory and role combinations that used to clip or read wrong.
  { name: 'combo-curly-headphones', query: 'chars=2&hair=6&acc=headphones&role=engineer&hc=0', steps: 8, at: [0, 0, 1.7] },
  { name: 'combo-longhair-hood', query: 'chars=2&hair=2&acc=none&role=engineer', steps: 8, at: [0, 0, 1.7] },
  { name: 'combo-support-hat', query: 'chars=2&hair=2&acc=cap&role=support', steps: 8, at: [0, 0, 1.7] },
  { name: 'combo-security', query: 'chars=2&hair=5&acc=none&role=security&build=2', steps: 8, at: [0, 0, 1.7] },
  { name: 'combo-headphones-side', query: 'chars=2&hair=2&acc=headphones&role=designer', steps: 8, at: [0, 0, 1.7] },
  { name: 'hq-exp2', query: 'mock=hq', setup: `__HITL.state.office.expansion = 2;`, steps: 30 },
  { name: 'hq-exp3', query: 'mock=hq', setup: `__HITL.state.office.expansion = 3;`, steps: 30 },
  // The procedural poses: the Low quality fallback (and ?rig=0).
  { name: 'char-lineup-procedural', query: 'chars=1&rig=0', steps: 20 },
  { name: 'desk-typing-procedural', query: 'mock=floor&rig=0', setup: `(${MOODS})(['ok']); __focus = 0;`, steps: 45, zoom: 4.2 },
  { name: 'desk-moods-procedural', query: 'mock=floor&rig=0', setup: `(${MOODS})(['coasting', 'burnout', 'tired']); __focus = 1;`, steps: 45, zoom: 3.2 },
  { name: 'couch-nap-procedural', query: 'mock=floor&rig=0', setup: `__HITL.state.office.placed.push({ id: 'g_couch', itemId: 'couch', level: 1, x: 1, y: 9, rot: 0 }); __nap = 'g_couch';`, steps: 60, zoom: 4.2 },
];

const FULL = !UPDATE && !ONLY;
const hash = FULL ? inputHash('golden') : null;
const before = passedAt('golden', hash);
if (before) {
  console.log(`golden: inputs unchanged since ${before}, skipped`);
  process.exit(0);
}

const H = await startHarness({ browsers: JOBS });
mkdirSync(REF, { recursive: true });
mkdirSync(OUT, { recursive: true });

let failed = 0;
const results = new Map();
async function runScene(sc, slot) {
  const { page, errors } = await H.openScene(`quality=medium&${sc.query}`, { width: W, height: H_PX, slot });
  const png = await page.evaluate(async ({ setup, steps, zoom, at }) => {
    const R = window.__hitlRender;
    const S = window.__HITL?.state;
    window.__focus = null; window.__nap = null;
    if (setup) (0, eval)(setup);
    const step = window.__step;
    step(10);
    if (window.__nap) {
      const who = S.staff[0].id;
      R.perks.send([who], window.__nap, { dur: 600, nap: true });
      for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) R.advance(0.1);
      const e = R.office.placed.get(window.__nap);
      R.focusAt(e.target.x, e.target.z, zoom);
    } else if (at) {
      R.focusAt(at[0], at[1], at[2]);
    } else if (window.__focus !== null && R.office?.current) {
      const d = R.office.current.desks[window.__focus];
      R.focusAt(d.seat.x, d.seat.z, zoom);
    }
    step(steps);
    const c = document.querySelector('canvas');
    return c.toDataURL('image/png');
  }, { setup: sc.setup ?? '', steps: sc.steps, zoom: sc.zoom ?? 1, at: sc.at ?? null });
  const buf = Buffer.from(png.split(',')[1], 'base64');
  const refPath = join(REF, `${sc.name}.png`);
  if (UPDATE || !existsSync(refPath)) {
    writeFileSync(refPath, buf);
    results.set(sc.name, `${sc.name}: reference ${UPDATE ? 'updated' : 'created'}`);
    await page.close();
    return;
  }
  // Compare in the page: both images drawn to canvases, pixels counted, a diff image built.
  const cmp = await page.evaluate(async ({ a, b, tol }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.width, h = ia.height;
    if (ib.width !== w || ib.height !== h) return { share: 1, diff: null };
    const ctx = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h); };
    const da = ctx(ia).data, db = ctx(ib).data;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d'); g.drawImage(ib, 0, 0);
    const od = g.getImageData(0, 0, w, h);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > tol) { n++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 80; }
      else { od.data[i] = od.data[i] * 0.35 + 160; od.data[i + 1] = od.data[i + 1] * 0.35 + 160; od.data[i + 2] = od.data[i + 2] * 0.35 + 160; }
    }
    g.putImageData(od, 0, 0);
    return { share: n / (w * h), diff: out.toDataURL('image/png') };
  }, { a: `data:image/png;base64,${readFileSync(refPath).toString('base64')}`, b: png, tol: CHANNEL_TOL });
  const ok = cmp.share <= MAX_SHARE && !errors.length;
  if (!ok) {
    failed++;
    writeFileSync(join(OUT, `${sc.name}.actual.png`), buf);
    if (cmp.diff) writeFileSync(join(OUT, `${sc.name}.diff.png`), Buffer.from(cmp.diff.split(',')[1], 'base64'));
  }
  results.set(sc.name, `${sc.name}: ${ok ? 'ok' : 'DIFFERS'} ${(cmp.share * 100).toFixed(3)}% of pixels${errors.length ? `, page errors: ${errors.join('; ')}` : ''}`);
  await page.close();
}

// A pool of JOBS workers takes scenes in order; results print in scene order.
const todo = SCENES.filter((sc) => !ONLY || ONLY.includes(sc.name));
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, async (_, slot) => {
  while (next < todo.length) {
    const sc = todo[next++];
    try { await runScene(sc, slot); } catch (e) { failed++; results.set(sc.name, `${sc.name}: ERROR ${e.message.split('\n')[0]}`); }
  }
}));
await H.close();
for (const sc of todo) console.log(`GOLDEN ${results.get(sc.name)}`);
if (!failed && results.size === SCENES.length) recordPass('golden', hash);
if (failed) console.log(`golden: ${failed} scene(s) differ; see shots/golden/*.diff.png, or run with --update if the change is intended`);
process.exit(failed ? 1 : 0);
