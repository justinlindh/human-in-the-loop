// Pose checks from geometry, with no rendering (#708): play one character through an animation, or a
// gesture over one, and measure it each frame in well under a second, so a pose is tuned on numbers
// and rendered once at the end.
//
//   node blender/checks/pose.mjs --gesture facepalm [--under typing] [--seconds 2.2] [--warm 1]
//        [--yaw-to-camera 0] [--view 0] [--rig on|off] [--every 6] [--json out.json]
//        [--root <checkout>]
//        [--expect 'hand0Face<=0.05@0.8'] [--expect 'faceCam<=70@0.8'] [--check-browser]
//   node blender/checks/pose.mjs --under idle --seconds 2          (an animation alone)
//
// Prints a row every --every frames (t, phase, animation, hand-to-face and hand-to-head distances in
// metres, face angle to the camera in degrees) and a summary over the gesture's frames. --expect
// rules hold a measure to a bound on a share of the gesture's frames (the whole run without a
// gesture): '<measure><op><value>@<share>', measure one of hand0Face, hand0Head, hand0HeadTop,
// hand1Face, hand1Head, hand1HeadTop (hand0 is the rig's armL) and faceCam; exit 1 if any fails.
// --rig off plays the procedural poses Low quality uses; the default, on, plays the authored clips
// as Medium and High do. --root measures another checkout's render code (a lane's worktree or a
// PR's) with this checkout's tool. --check-browser runs the same measures in a harness page and
// compares every number.
//
// It runs the game's own character code in Node through Vite's module loader, with two stand-ins:
// a canvas whose 2D context does nothing (cheek and emote textures only), and fetch reading the
// model files from public/. pose-measure.js holds the measuring; --check-browser runs it in a
// harness page as well and compares every number, which is how the stand-ins are kept honest.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
const ROOT = resolve(opt('root', join(import.meta.dirname, '../..')));
const OPTS = {
  under: opt('under', opt('gesture') ? 'typing' : 'idle'), gesture: opt('gesture', null), seconds: Number(opt('seconds', 2.2)),
  warm: Number(opt('warm', 1)), yawToCamera: Number(opt('yaw-to-camera', 0)), view: Number(opt('view', 0)), fps: 30, rig: opt('rig', 'on') !== 'off',
};
const EVERY = Number(opt('every', 6));
const MEASURES = ['hand0Face', 'hand0Head', 'hand0HeadTop', 'hand1Face', 'hand1Head', 'hand1HeadTop', 'faceCam'];
const valueOf = (f, m) => (m === 'faceCam' ? f.faceCam : f.contact[m]);

// The stand-ins for what a page gives: a canvas, fetch of public files, and the event types three's
// loaders construct.
function standIns() {
  const noop = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true });
  globalThis.document ??= { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx }), createElementNS: () => ({ style: {}, addEventListener() {} }) };
  globalThis.self ??= globalThis;
  globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };
  const real = globalThis.fetch;
  globalThis.Request = class { constructor(url, init = {}) { this.url = String(url); this.headers = new Headers(init.headers); this.method = 'GET'; } };
  globalThis.fetch = async (url, o) => {
    const u = typeof url === 'string' ? url : url.url;
    if (/^https?:/.test(u)) return real(u, o);
    return new Response(readFileSync(join(ROOT, 'public', decodeURIComponent(u.replace(/^\//, '')))), { status: 200 });
  };
}

function parseRule(s) {
  const m = /^(\w+)\s*(<=|>=|<|>)\s*(-?[\d.]+)(?:@([\d.]+))?$/.exec(s.replace(/\s+/g, ''));
  if (!m || !MEASURES.includes(m[1])) throw new Error(`pose: can't read rule "${s}" (want e.g. hand1Face<=0.05@0.8, measure one of ${MEASURES.join(', ')})`);
  return { text: s, measure: m[1], op: m[2], value: Number(m[3]), share: m[4] ? Number(m[4]) : 1 };
}
const cmp = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '>': (a, b) => a > b };

// The same run in a harness page (the real canvas, fetch and loaders), compared number by number:
// the stand-ins are only right while the two agree.
async function checkBrowser(frames) {
  const { startHarness } = await import('./harness.mjs');
  const H = await startHarness();
  try {
    const { page } = await H.openScene('quality=medium&mock=floor', { width: 320, height: 200 });
    const b = await page.evaluate(async (o) => (await import('/blender/checks/pose-measure.js')).playPose(o), OPTS);
    const flat = (f) => [f.t, ...f.eyes, ...f.forward, ...f.head, ...f.hands.flat(), ...Object.values(f.contact).map((v) => v ?? 0), f.faceCam];
    let worst = 0, at = null;
    if (b.frames.length !== frames.length) { console.log(`POSE FAIL browser check: ${b.frames.length} frames in the page, ${frames.length} in Node`); return 1; }
    frames.forEach((f, i) => { const x = flat(f), y = flat(b.frames[i]); x.forEach((v, k) => { const d = Math.abs(v - y[k]); if (d > worst) { worst = d; at = `frame ${i} value ${k}`; } }); });
    const ok = worst <= 1e-3;
    console.log(`POSE ${ok ? 'ok  ' : 'FAIL'} browser check: ${frames.length} frames, largest difference ${worst.toExponential(2)}${at ? ` (${at})` : ''}${ok ? '' : ': the Node stand-ins no longer match the page'}`);
    return ok ? 0 : 1;
  } finally {
    await H.close();
  }
}

// The page a browser check opens serves this checkout, so it can only check this checkout's code.
if (argv.includes('--check-browser') && ROOT !== resolve(join(import.meta.dirname, '../..'))) {
  console.error(`pose: --check-browser measures the page's own checkout, not --root; run pose.mjs from ${ROOT} (copy blender/checks/pose*.js there) to check it`);
  process.exit(2);
}
// The browser check renders, so it takes a render slot first; taking one re-runs this script under
// the lock, which must happen before anything is printed.
if (argv.includes('--check-browser')) {
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
}
const t0 = performance.now();
standIns();
const vite = await createServer({ root: ROOT, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let code = 0;
try {
  const P = await vite.ssrLoadModule(join(import.meta.dirname, 'pose-measure.js'));
  const { frames, info } = await P.playPose(OPTS);
  const fmt = (v, w = 7) => (v == null ? '-' : String(v)).padStart(w);
  console.log(`POSE ${'t'.padStart(5)} ${'phase'.padEnd(7)} ${'anim'.padEnd(12)}${MEASURES.map((m) => fmt(m, 13)).join('')}`);
  frames.forEach((f, i) => {
    if (i % EVERY && i !== frames.length - 1) return;
    console.log(`POSE ${f.t.toFixed(2).padStart(5)} ${f.phase.padEnd(7)} ${String(f.anim).padEnd(12)}${MEASURES.map((m) => fmt(valueOf(f, m), 13)).join('')}`);
  });
  const judged = frames.filter((f) => f.phase === 'gesture' || f.phase === 'pose');
  const stat = (m) => { const v = judged.map((f) => valueOf(f, m)).filter((x) => x != null).sort((a, b) => a - b); return v.length ? { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] } : null; };
  console.log(`pose: ${OPTS.gesture ? `${OPTS.gesture} over ${OPTS.under}` : OPTS.under}, ${judged.length} judged frames:`);
  for (const m of MEASURES) { const s = stat(m); if (s) console.log(`  ${m.padEnd(13)} min ${s.min}  median ${s.median}  max ${s.max}`); }
  for (const r of all('expect').map(parseRule)) {
    const ok = judged.filter((f) => valueOf(f, r.measure) != null && cmp[r.op](valueOf(f, r.measure), r.value)).length / Math.max(1, judged.length);
    const pass = ok >= r.share;
    if (!pass) code = 1;
    console.log(`POSE ${pass ? 'ok  ' : 'FAIL'} ${r.text}: ${(ok * 100).toFixed(0)}% of judged frames (want ${(r.share * 100).toFixed(0)}%)`);
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ info, frames }, null, 1));
  if (argv.includes('--check-browser')) code = Math.max(code, await checkBrowser(frames));
  console.log(`pose: ${frames.length} frames in ${(performance.now() - t0).toFixed(0)} ms`);
} catch (e) {
  console.error(e.message);
  code = 2;
} finally {
  await vite.close();
}
process.exit(code);
