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
    const r = await playPose({ under: 'typing', gesture: 'facepalm', view: 0, yawToCamera: o.view * 90, look: { build: 1 }, covers: ['coverHandEyeNear', 'coverHandEyeL', 'coverHandEyeR', 'coverHandFace'] });
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
    if (!(r.miss < 0.1)) fail(`a hand placed on ${lm} reads ${r.miss} on the other eye, want under 0.1`);
  }
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
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) { console.error(`lab-smoke: page errors:\n${errors.join('\n')}`); code = 1; }
process.exit(code);
