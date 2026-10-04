// Golden images: a fixed set of close-up renders compared against stored references.
//
//   node blender/checks/golden.mjs            compare; exits 1 if any scene differs
//   node blender/checks/golden.mjs --update   rewrite the references (commit them deliberately)
//   --only=a,b    just these scenes      --software  SwiftShader instead of the GPU
//   --jobs=N      scenes rendered at once under --software (default 8); a GPU run renders one at a time
//
// Each scene renders in its own page with its own seeded random and frozen clock, so the pixels do
// not depend on the order. Each scene that passes (or is updated) is
// recorded with every file its page loaded (cache.mjs); a later run, verify or --update, skips a
// scene when none of those files, its reference, or anything else in its base key changed, and
// starts no browser at all when every scene is unchanged and the frame-by-frame identity check (below)
// has a matching success record of its own. Scene records never stand in for it: with the scenes
// cached but no current identity record, golden opens a browser for the identity check alone.
// HITL_NO_CHECK_CACHE=1 renders and checks everything. HITL_GOLDEN_OUT moves the failure artifacts
// (default shots/golden).
//
// Each scene loads the game through harness.mjs (Math.random seeded, the clock frozen, the game
// loop held) and steps a fixed number of frames by hand, drawing only the last (__settle), so a
// render depends only on the code.
// Differences are counted per pixel (any channel off by more than CHANNEL_TOL); a scene fails when
// more than MAX_SHARE of pixels differ. Failures write <scene>.actual.png and <scene>.diff.png next to the reference.
import { startHarness, wantGpu } from './harness.mjs';
import { sceneBase, sceneUpToDate, recordScene, clearScene, requestedFiles } from './cache.mjs';
import { logTiming } from '../../scripts/lib/timing.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, 'golden');
const OUT = process.env.HITL_GOLDEN_OUT ? resolve(process.env.HITL_GOLDEN_OUT) : resolve(HERE, '..', '..', 'shots', 'golden');
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
// The references are GPU renders, reproduced byte for byte only while scenes render one at a time, so a
// GPU run is serial and ignores --jobs. --software (SwiftShader) still renders --jobs scenes at once,
// for a machine without the GPU; its pixels differ from the references.
const GPU = wantGpu();
const JOBS = GPU ? 1 : Math.max(1, Number(process.argv.find((a) => a.startsWith('--jobs='))?.slice(7)) || 8);
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

// The code a scene's pixels depend on beyond what its page loads.
const TOOL_FILES = ['blender/checks/golden.mjs', 'blender/checks/harness.mjs', 'blender/checks/cache.mjs', 'scripts/lib/gl.js'];
const refRel = (sc) => `blender/checks/golden/${sc.name}.png`;
const selected = SCENES.filter((sc) => !ONLY || ONLY.includes(sc.name));
// Drawing only the final frame is exact only while nothing in the draw path carries state from one
// frame to the next (history buffers, accumulation, trails in post). Whenever golden renders, one
// scene is also drawn frame by frame and must match its settled render byte for byte, so such an
// effect fails here instead of drifting every reference. HITL_GOLDEN_IDENTITY_SETUP is script run in
// that scene's page before it steps (a test hook for a deliberate temporal effect).
const IDENTITY = { ...SCENES.find((sc) => sc.name === 'char-lineup'), setup: process.env.HITL_GOLDEN_IDENTITY_SETUP || undefined };
const IDENTITY_CHECK = 'golden-identity';
IDENTITY.base = sceneBase(IDENTITY_CHECK, { ...IDENTITY, base: undefined, W, H_PX, gpu: GPU }, TOOL_FILES);
const identityFresh = sceneUpToDate(IDENTITY_CHECK, IDENTITY.name, IDENTITY.base, 'blender/checks/golden.mjs');
logTiming({ kind: 'cache', tool: 'golden', scene: `${IDENTITY.name}:identity`, cache: IDENTITY.base ? (identityFresh ? 'hit' : 'miss') : 'off', input: IDENTITY.base });
const results = new Map();
const todo = [];
for (const sc of selected) {
  sc.base = sceneBase('golden', { ...sc, base: undefined, gpu: GPU }, TOOL_FILES);
  const fresh = sceneUpToDate('golden', sc.name, sc.base, refRel(sc));
  logTiming({ kind: 'cache', tool: 'golden', scene: sc.name, cache: sc.base ? (fresh ? 'hit' : 'miss') : 'off', input: sc.base });
  if (fresh) results.set(sc.name, `${sc.name}: unchanged, skipped`);
  else todo.push(sc);
}
if (!todo.length && identityFresh) {
  for (const sc of selected) console.log(`GOLDEN ${results.get(sc.name)}`);
  console.log(`golden: all ${selected.length} scenes unchanged since they last passed, and ${IDENTITY.name} identity is on record, skipped`);
  process.exit(0);
}

const H = await startHarness({ gpu: GPU, browsers: Math.max(1, Math.min(JOBS, todo.length)) });
mkdirSync(REF, { recursive: true });
mkdirSync(OUT, { recursive: true });

let failed = 0;
// A scene's page script: set it up, step it to its pose, and return the canvas as a PNG data URL.
// settle draws only each run of frames' last (__settle); false draws every frame (__step).
const POSE = async ({ setup, steps, zoom, at, settle }) => {
    const R = window.__hitlRender;
    const S = window.__HITL?.state;
    window.__focus = null; window.__nap = null;
    if (setup) (0, eval)(setup);
    const step = settle ? window.__settle : window.__step;
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
  };
const poseArgs = (sc, settle) => ({ setup: sc.setup ?? '', steps: sc.steps, zoom: sc.zoom ?? 1, at: sc.at ?? null, settle });

async function runScene(sc, slot) {
  const { page, errors, requests } = await H.openScene(`quality=medium&${sc.query}`, { width: W, height: H_PX, slot });
  const png = await page.evaluate(POSE, poseArgs(sc, true));
  const buf = Buffer.from(png.split(',')[1], 'base64');
  const refPath = join(REF, `${sc.name}.png`);
  if (UPDATE || !existsSync(refPath)) {
    writeFileSync(refPath, buf);
    results.set(sc.name, `${sc.name}: reference ${UPDATE ? 'updated' : 'created'}`);
    if (!errors.length) recordScene('golden', sc.name, sc.base, requestedFiles(requests), refRel(sc));
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
  if (ok) recordScene('golden', sc.name, sc.base, requestedFiles(requests), refRel(sc));
  if (!ok) {
    failed++;
    writeFileSync(join(OUT, `${sc.name}.actual.png`), buf);
    if (cmp.diff) writeFileSync(join(OUT, `${sc.name}.diff.png`), Buffer.from(cmp.diff.split(',')[1], 'base64'));
  }
  results.set(sc.name, `${sc.name}: ${ok ? 'ok' : 'DIFFERS'} ${(cmp.share * 100).toFixed(3)}% of pixels${errors.length ? `, page errors: ${errors.join('; ')}` : ''}`);
  await page.close();
}

// A pool of JOBS workers takes scenes in order; results print in scene order.
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, async (_, slot) => {
  while (next < todo.length) {
    const sc = todo[next++];
    try { await runScene(sc, slot); } catch (e) { failed++; results.set(sc.name, `${sc.name}: ERROR ${e.message.split('\n')[0]}`); }
  }
}));
const sha = (png) => createHash('sha256').update(png).digest('hex').slice(0, 16);
const identityFiles = { stepped: join(OUT, `${IDENTITY.name}.stepped.png`), settled: join(OUT, `${IDENTITY.name}.settled.png`) };
// Runs the check; true only when both renders exist, match byte for byte and raised no page errors.
// Whatever renders exist are saved when it does not pass, so a failure can be looked at.
async function identity() {
  const shot = async (settle) => {
    let page;
    const r = { png: null, errors: [], error: null, requests: [] };
    try {
      const o = await H.openScene(`quality=medium&${IDENTITY.query}`, { width: W, height: H_PX });
      page = o.page; r.errors = o.errors; r.requests = o.requests;
      r.png = await page.evaluate(POSE, poseArgs(IDENTITY, settle));
    } catch (e) { r.error = e.message.split('\n')[0]; } finally { await page?.close().catch(() => {}); }
    return r;
  };
  const stepped = await shot(false);
  const settled = await shot(true);
  const both = { stepped, settled };
  const ran = stepped.png && settled.png;
  if (ran && stepped.png === settled.png && !stepped.errors.length && !settled.errors.length) {
    recordScene(IDENTITY_CHECK, IDENTITY.name, IDENTITY.base, requestedFiles([...stepped.requests, ...settled.requests]), 'blender/checks/golden.mjs');
    return true;
  }
  for (const [k, f] of Object.entries(identityFiles)) if (both[k].png) writeFileSync(f, Buffer.from(both[k].png.split(',')[1], 'base64'));
  for (const [k, r] of Object.entries(both)) {
    if (r.error) console.log(`golden: identity ${k} render failed to run: ${r.error}`);
    if (r.errors.length) console.log(`golden: identity ${k} page errors: ${r.errors.slice(0, 3).join('; ')}`);
  }
  if (!ran) { console.log(`golden: identity not established; saved ${Object.keys(identityFiles).filter((k) => both[k].png).map((k) => `${IDENTITY.name}.${k}.png`).join(', ') || 'no renders'} in shots/golden/`); return false; }
  if (stepped.png === settled.png) { console.log(`golden: identity renders match (sha ${sha(stepped.png)}) but the pages raised errors; renders in shots/golden/${IDENTITY.name}.{stepped,settled}.png`); return false; }
  // What differs: the differing pixels counted and boxed in the log, with hashes of both renders.
  let where = '';
  try {
    where = execFileSync('magick', ['compare', '-metric', 'AE', identityFiles.stepped, identityFiles.settled, 'null:'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) { where = String(e.stderr ?? '').trim().split(' ')[0]; }
  let box = '';
  try { box = execFileSync('magick', [identityFiles.stepped, identityFiles.settled, '-compose', 'difference', '-composite', '-threshold', '0', '-format', '%@', 'info:'], { encoding: 'utf8' }).trim(); } catch { /* no magick */ }
  console.log(`golden: identity mismatch: ${where || '?'} pixels differ${box ? `, inside ${box}` : ''}; stepped sha ${sha(stepped.png)}, settled sha ${sha(settled.png)}; renders in shots/golden/${IDENTITY.name}.{stepped,settled}.png`);
  return false;
}
// A current success record stands in for the check. Otherwise the record is dropped before the
// check starts and written only if it passes, so an interrupted run leaves nothing to vouch for it.
let identical = identityFresh;
if (!identityFresh) {
  clearScene(IDENTITY_CHECK, IDENTITY.name);
  try { identical = await identity(); } catch (e) { console.log(`golden: identity check failed to run: ${e.message.split('\n')[0]}`); }
  if (!identical) clearScene(IDENTITY_CHECK, IDENTITY.name);
}
await H.close();
for (const sc of selected) console.log(`GOLDEN ${results.get(sc.name)}`);
if (!identical) {
  failed++;
  console.log(`golden: identity not established for ${IDENTITY.name}: the frame-by-frame and final-frame renders did not both come out identical (see above). A draw path that keeps state between frames is one cause, a page or asset not ready in one render another`);
} else console.log(`golden: ${IDENTITY.name} is byte-identical drawn frame by frame and final frame only${identityFresh ? ' (on record, not redrawn)' : ''}`);
console.log(`golden: rendered ${todo.length} of ${selected.length} scenes; ${selected.length - todo.length} unchanged, skipped`);
if (failed) console.log(`golden: ${failed} scene(s) differ; see shots/golden/*.diff.png, or run with --update if the change is intended (then commit and post before/after media: scripts/baseline-media.sh <pr>)`);
if (UPDATE) console.log('golden: updated references need before/after media on the PR: commit them, then scripts/baseline-media.sh <pr>');
process.exit(failed ? 1 : 0);
