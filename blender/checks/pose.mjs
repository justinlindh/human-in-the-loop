// Pose checks from geometry, with no rendering (#708): play one character through an animation, or a
// gesture over one, and measure it each frame in well under a second, so a pose is tuned on numbers
// and rendered once at the end.
//
//   node blender/checks/pose.mjs --gesture facepalm [--under typing] [--seconds 2.2] [--warm 1]
//        [--yaw-to-camera 0] [--view 0] [--rig on|off] [--every 6] [--json out.json]
//        [--root <checkout>]
//        [--expect 'hand0Face<=0.05@0.8'] [--expect 'faceCam<=70@0.8'] [--check-browser]
//   node blender/checks/pose.mjs --under idle --seconds 2          (an animation alone)
//   node blender/checks/pose.mjs --scene [--mock floor | --moment '<query>' | --snapshot <path>]
//        [--patch-js '<js>'] [--event '<json>'] [--warm 30] [--frames 0,15,30 | --clip <s> --every 6]
//        [--who s3,s5] [--view 0] [--expect 's3:faceCovered<=0.1@0.8'] [--expect 'faceVisible>=0.9']
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
// --scene measures people in a staged scene, in a harness page (it renders, so it takes a render
// slot): for each person, the largest share of their face a bubble, label or emote covers and which,
// the share of them the camera sees and what hides the rest, the face's angle to the camera and its
// height on screen in pixels. Its rules use faceCovered, faceVisible, faceCam and facePx, over the
// requested frames, for every person listed (or one, with an 'id:' prefix). Missing samples fail.
// Scene mode serves this checkout and rejects a differing --root.
//
// It runs the game's own character code in Node through Vite's module loader, with two stand-ins:
// a canvas whose 2D context does nothing (cheek and emote textures only), and fetch reading the
// model files from public/. pose-measure.js holds the measuring; --check-browser runs it in a
// harness page as well and compares every number, which is how the stand-ins are kept honest.
import { createServer } from 'vite';
import { judgeScene } from './pose-rules.js';
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
async function sceneMode() {
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
  const t0 = performance.now();
  const { startHarness } = await import('./harness.mjs');
  const { resolveTarget, openAt } = await import('../../scripts/events/load.js');
  const rules = all('expect').map((txt) => {
    const m = /^(?:([\w:]+?):)?(\w+)\s*(<=|>=|<|>)\s*(-?[\d.]+)(?:@([\d.]+))?$/.exec(txt.replace(/\s+/g, ''));
    if (!m || !SCENE_MEASURES.includes(m[2])) throw new Error(`pose: can't read scene rule "${txt}" (want e.g. s3:faceCovered<=0.1@0.8, measure one of ${SCENE_MEASURES.join(', ')})`);
    return { text: txt, id: m[1] ?? null, measure: m[2], op: m[3], value: Number(m[4]), share: m[5] ? Number(m[5]) : 1 };
  });
  const every = Number(opt('every', 6));
  const frames = opt('clip') ? Array.from({ length: Math.floor((Number(opt('clip')) * 30) / every) + 1 }, (_, i) => i * every) : String(opt('frames', '0')).split(',').map(Number).sort((a, b) => a - b);
  const H = await startHarness();
  let code = 0;
  try {
    const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
    const { page, errors } = target ? await openAt(H, target, { width: 1280, height: 800, quality: 'medium' }) : await H.openScene(`quality=medium&mock=${opt('mock', 'floor')}`, { width: 1280, height: 800 });
    const who = opt('who') ? opt('who').split(',') : null;
    const rows = await page.evaluate(async (o) => {
      const R = window.__hitlRender, S = window.__HITL.state;
      const M = await import('/blender/checks/pose-scene.js');
      for (let i = 0; i < o.view; i++) { dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); }
      window.__settle(o.warm);
      if (o.patchJs) new Function('S', 'R', o.patchJs)(S, R);
      if (o.events) R.handleEvents([].concat(o.events), S);
      const out = [];
      let at = 0;
      for (const f of o.frames) {
        window.__step(Math.max(0, f - at)); at = f;
        for (const r of M.measureScene(R, S, { who: o.who })) out.push({ frame: f, ...r });
      }
      return out;
    }, { view: Number(opt('view', 0)), warm: Number(opt('warm', 30)), patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, frames, who });
    const fmt = (v, w) => (v == null ? '-' : String(v)).padStart(w);
    console.log(`POSE ${'frame'.padStart(5)} ${'id'.padEnd(10)} ${'anim'.padEnd(12)} ${'covered'.padStart(8)} ${'visible'.padStart(8)} ${'faceCam'.padStart(8)} ${'facePx'.padStart(7)}  by / occluder / moment`);
    for (const r of rows) console.log(`POSE ${fmt(r.frame, 5)} ${String(r.id).padEnd(10)} ${String(r.anim ?? '-').padEnd(12)} ${fmt(r.faceCovered, 8)} ${fmt(r.faceVisible, 8)} ${fmt(r.faceCam, 8)} ${fmt(r.facePx, 7)}  ${[r.coveredBy && `covered by ${r.coveredBy}`, r.occluder && r.faceVisible < 1 ? `hidden by ${r.occluder}` : null, r.moment && `${r.moment}/${r.beat}`].filter(Boolean).join('; ')}`);
    const ids = [...new Set(rows.map((r) => r.id))];
    const judged = judgeScene(rows, frames, who, rules);
    if (!judged.pass) code = 1;
    if (!ids.length) console.log('POSE FAIL no subjects measured');
    for (const missing of judged.missing) console.log(`POSE FAIL ${missing.id}: missing samples at frames ${missing.frames.join(', ')}`);
    for (const { id, rule, share, pass } of judged.verdicts) {
      console.log(`POSE ${pass ? 'ok  ' : 'FAIL'} ${id} ${rule.text}: ${(share * 100).toFixed(0)}% of ${frames.length} requested frames (want ${(rule.share * 100).toFixed(0)}%)`);
    }
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(rows, null, 1));
    if (errors.length) { code = Math.max(code, 1); console.log(`pose: page errors: ${errors.slice(0, 3).join('; ')}`); }
    console.log(`pose: scene, ${ids.length} people, ${frames.length} frames in ${(performance.now() - t0).toFixed(0)} ms`);
  } finally {
    await H.close();
  }
  return code;
}

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

const SCENE_MEASURES = ['faceCovered', 'faceVisible', 'faceCam', 'facePx'];

// The page a browser check opens serves this checkout, so it can only check this checkout's code.
const browserMode = argv.includes('--scene') ? '--scene' : argv.includes('--check-browser') ? '--check-browser' : null;
if (browserMode && ROOT !== resolve(join(import.meta.dirname, '../..'))) {
  console.error(`pose: ${browserMode} measures the page's own checkout, not --root; run pose.mjs from ${ROOT} (copy blender/checks/pose*.js there) to check it`);
  process.exit(2);
}
if (argv.includes('--scene')) process.exit(await sceneMode());

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
