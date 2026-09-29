#!/usr/bin/env node
// Opens the pose lab in headless Chromium against a lab server it starts, drives it, and checks it.
//   node scripts/tools/lab-smoke.mjs [--out shots/lab.png] [--view n] [--frame n] [--width w --height h] [--touch]
// Exits 1 on a page or console error, or when a check below fails: the lab loads, the readouts hold
// numbers, the numbers equal playPose's for the same frame, and a slider change reaches the rendered code.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, holdRenderLock, glMode } from '../lib/gl.js';
import { livePlugin } from './lab.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const mode = glMode();
holdRenderLock(mode);
const { plugin } = livePlugin(ROOT);
const server = await createServer({ root: ROOT, plugins: [plugin], server: { port: 0 }, optimizeDeps: { include: ['three-mesh-bvh'] }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const { browser } = await launchChromium(chromium, { mode, label: 'lab-smoke' }).then((b) => ({ browser: b.browser ?? b }));
const errors = [];
let code = 0;
const fail = (m) => { console.error(`lab-smoke: FAIL ${m}`); code = 1; };
try {
  const page = await browser.newPage({ viewport: { width: Number(opt('width', 1280)), height: Number(opt('height', 760)) }, hasTouch: argv.includes('--touch') });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const q = `?gesture=facepalm&under=typing&view=${opt('view', 0)}&frame=${opt('frame', 70)}`;
  await page.goto(`${base}pose-lab.html${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && window.__labFrame, null, { timeout: 120000 });
  const got = await page.evaluate(() => ({ f: window.__labFrame, covers: window.__lab.covers() }));
  console.log(`lab-smoke: frame t=${got.f.t} phase=${got.f.phase} hand0Eye=${got.f.contact.hand0Eye} covers=${JSON.stringify(got.covers)}`);
  // The same frame from the module the checks run.
  const ref = await page.evaluate(async (o) => {
    const { playPose } = await import('/blender/checks/pose-measure.js');
    const r = await playPose({ under: 'typing', gesture: 'facepalm', view: 0, yawToCamera: o.view * 90, side: o.view === 3 ? -1 : 1, look: { build: 1 }, covers: ['coverHandEyeNear', 'coverHandEyeL', 'coverHandEyeR', 'coverHandFace'] });
    return r.frames[o.frame - 1];
  }, { view: Number(opt('view', 0)), frame: Number(opt('frame', 70)) });
  if (JSON.stringify(ref.contact) !== JSON.stringify(got.f.contact)) fail('lab contact numbers differ from playPose');
  if (JSON.stringify(ref.cover) !== JSON.stringify(got.covers)) fail(`lab cover numbers differ from playPose: ${JSON.stringify(got.covers)} vs ${JSON.stringify(ref.cover)}`);
  if (!Number.isFinite(got.covers.coverHandEyeNear)) fail('no cover number');
  // A planted control: a hand placed on an eye must read as covering that eye, and not the other one.
  const planted = await page.evaluate(async () => {
    const out = {};
    for (const [lm, hit, miss] of [['EyeLeft', 'coverHandEyeL', 'coverHandEyeR'], ['EyeRight', 'coverHandEyeR', 'coverHandEyeL']]) {
      await window.__lab.seek(70);
      const c = await window.__lab.plant(lm);
      out[lm] = { hit: c[hit], miss: c[miss] };
    }
    await window.__lab.seek(70);
    return out;
  });
  console.log(`lab-smoke: planted control ${JSON.stringify(planted)}`);
  // A person facing away has no face in view to cover, so the control needs a view that shows it.
  for (const [lm, r] of got.f.faceCam < 100 ? Object.entries(planted) : []) {
    if (!(r.hit >= 0.5)) fail(`a hand placed on ${lm} reads ${r.hit} cover, want at least 0.5`);
    // In profile the near eye hides the far one from the camera, so only a face-on view separates them.
    if (got.f.faceCam < 30 && !(r.miss < 0.1)) fail(`a hand placed on ${lm} reads ${r.miss} on the other eye, want under 0.1`);
  }
  // The matrix view: a small grid runs, has one cell per view, and a cell loads into the viewport.
  const grid = await page.evaluate(async (axesArg) => {
    window.__lab.state.mxAxes = axesArg;
    await window.__lab.runGrid();
    const m = window.__lab.matrix();
    const cell = m.cells.find((c) => c.view === 2);
    await window.__lab.loadCell(cell);
    // The hand a cell was judged on is the hand the viewport plays: view 3 is the right hand (side -1).
    const v3 = m.cells.find((c) => c.view === 3);
    await window.__lab.loadCell(v3);
    const sides = { cell: v3.side, viewport: window.__lab.side() };
    await window.__lab.loadCell(cell);
    return { sides, n: m.cells.length, passing: m.cells.filter((c) => c.pass && !c.na).length, na: m.cells.filter((c) => c.na).length, summary: document.getElementById('mxsum').textContent, naButtons: document.querySelectorAll('#grid button.cell.na').length, cells: m.cells.slice(0, 4).map((c) => [c.view, c.pass, c.verdicts[0].share]), loaded: { view: window.__lab.state.view, under: window.__lab.state.under, frame: window.__lab.state.frame }, buttons: document.querySelectorAll('#grid button.cell').length };
  }, opt('axes', 'views=all,postures=sit,builds=1,rig=on'));
  console.log(`lab-smoke: matrix ${JSON.stringify(grid)}`);
  if (opt('grid-out')) { await page.evaluate(() => document.getElementById('grid').scrollIntoView()); await page.screenshot({ path: opt('grid-out') }); }
  if (!opt('axes') && grid.n !== 4) fail('the matrix did not give four cells');
  if (grid.sides.cell !== -1 || grid.sides.viewport !== -1) fail(`view 3 cell side ${grid.sides.cell}, viewport plays side ${grid.sides.viewport}, want -1 for both`);
  if (grid.loaded.view !== 2) fail('clicking a cell did not load it');
  // A slider change reaches the render code: PALM_STAND[2] moves the hand, and the page reloads on it.
  const before = got.f.contact.hand0Eye;
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('poselab') ?? '{}'); s.changed = { 'src/render/character.js:PALM_SIT[2]': 0.4 }; sessionStorage.setItem('poselab', JSON.stringify(s)); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && window.__labFrame, null, { timeout: 120000 });
  const after = await page.evaluate(() => window.__labFrame.contact.hand0Eye);
  console.log(`lab-smoke: hand0Eye ${before} -> ${after} with PALM_SIT[2]=0.4`);
  if (after === before) fail('a param override did not change the measure');
  await page.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('poselab') ?? '{}'); s.changed = {}; sessionStorage.setItem('poselab', JSON.stringify(s)); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && window.__labFrame, null, { timeout: 120000 });
  if (opt('out')) { await page.screenshot({ path: opt('out') }); console.log(`lab-smoke: ${opt('out')}`); }
  // The slap: the fixer and the robot in one scene, and the lab's slap numbers equal playSlap's for the same frame.
  const slapFrame = Number(opt('slap-frame', 30));
  await page.evaluate(() => sessionStorage.removeItem('poselab'));
  await page.goto(`${base}pose-lab.html?gesture=slap&view=0&frame=${slapFrame}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lab && window.__labFrame, null, { timeout: 120000 });
  const slap = await page.evaluate(async (n) => {
    const { playSlap } = await import('/blender/checks/pose-slap.js');
    const ref = (await playSlap({ build: 1, rig: true, view: 0 })).frames[n - 1];
    return { lab: window.__labFrame.contact, ref: ref.contact, actors: window.__lab.actors() };
  }, slapFrame);
  console.log(`lab-smoke: slap lab ${JSON.stringify(slap.lab)} playSlap ${JSON.stringify(slap.ref)} actors ${slap.actors}`);
  if (JSON.stringify(slap.lab) !== JSON.stringify(slap.ref)) fail('the lab slap numbers differ from playSlap');
  if (slap.actors !== 2) fail(`the slap scene holds ${slap.actors} actors, want the fixer and the robot`);
  if (opt('slap-out')) { await page.screenshot({ path: opt('slap-out') }); console.log(`lab-smoke: ${opt('slap-out')}`); }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) { console.error(`lab-smoke: page errors:\n${errors.join('\n')}`); code = 1; }
process.exit(code);
