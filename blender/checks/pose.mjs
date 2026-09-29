// Pose checks from geometry: play one character through an animation, or a gesture over one, and
// measure it each frame in well under a second with no rendering, so a pose is tuned on numbers and
// rendered once at the end. --scene measures people in a staged game scene instead.
//
//   node blender/checks/pose.mjs --gesture facepalm [--under typing] [--seconds 2.2] [--warm 1]
//        [--yaw-to-camera 0] [--view 0] [--rig on|off] [--every 6] [--json out.json]
//        [--root <checkout>] [--param [file:]NAME[idx]=value]... [--sweep NAME=a,b,c --measure <m> ...]
//        [--expect 'hand0Face<=0.05@0.8'] [--expect 'faceCam<=70@0.8'] [--check-browser]
//   node blender/checks/pose.mjs --under idle --seconds 2          (an animation alone)
//   node blender/checks/pose.mjs --scene [--mock floor | --seed N [--week W] | --moment '<query>' | --snapshot <path>]
//        [--patch-js '<js>'] [--event '<json>'] [--warm 30] [--frames 0,15,30 | --clip <s> --every 6]
//        [--who s3,s5] [--view 0] [--expect 's3:faceCovered<=0.1@0.8'] [--expect 'faceVisible>=0.9']
//        [--slow-raycast] [--render-reference] [--profile <file>] [--json out.json]
//   node blender/checks/pose.mjs --scene --serve     (one NDJSON request per stdin line, see below)
//
// Prints a row every --every frames (t, phase, animation, hand-to-face and hand-to-head distances in
// metres, face angle to the camera in degrees) and a summary over the gesture's frames. --expect
// rules hold a measure to a bound on a share of the gesture's frames (the whole run without a
// gesture): '<measure><op><value>@<share>', measure one of hand0Face, hand0Head, hand0HeadTop,
// hand1Face, hand1Head, hand1HeadTop, hand{0,1}{EyeLeft,EyeRight,Eye,Brow,Forehead,Mouth,Chin}
// (hand0 is the rig's armL) and faceCam; exit 1 if any fails.
// --rig off plays the procedural poses Low quality uses; the default, on, plays the authored clips
// as Medium and High do. --root measures another checkout's render code (a lane's worktree or a
// PR's) with this checkout's tool. --check-browser runs the same measures in a harness page and
// compares every number.
//
// --param overrides a module-level const in game code for the run, with no source edit (see
// param.js); --sweep NAME=a,b,c runs the measurement once per value and prints one table (see
// param-sweep.js: --across, --measure, --rows, --pick). Neither works with --serve.
//
// --scene runs in a harness page under the render lock, drawing nothing: warm-up and sampling both
// run through the update path with no draw call. For each person: faceCovered (how much of the head
// a label or emote covers), faceVisible (the share of seven facial landmarks the camera sees, and
// what hides them; not which way the face points), faceCam (the face's angle to the camera, degrees)
// and facePx (the drawn head's height). Rules use faceCovered, faceVisible, bodyVisible, faceCam and
// facePx over the requested frames, for every person listed (or one, with an 'id:' prefix). Missing
// samples fail.
// heldHeadDepth and heldTorsoDepth are mesh penetration in metres; heldGap is wrist-to-prop surface
// distance. An absent prop has null measures and fails these rules. Use --every 1 for a whole hold.
// Scene mode serves this checkout and rejects a differing --root.
// Raycasts go through per-mesh bounding-volume trees; --slow-raycast uses three.js's own raycast, to
// compare. --render-reference retains rendered scene stepping for comparison. --profile <file> writes
// phase timings and actual WebGL draw counts separately from the unchanged --json rows.
//
// --serve keeps the browser and Vite server open across requests instead of paying their startup
// every time, but opens a fresh page for each one, so results always match a cold run exactly: each
// stdin line is a JSON object with the same fields as the flags above in camelCase (mock, moment,
// snapshot, patchJs, event, warm, frames, clip, every, who, view, rig, expect (an array), slowRaycast,
// renderReference, profile, json), printed and judged exactly like a single cold run, then a
// `POSE serve <n> code=<0|1|2> ...` summary line. `{"quit": true}` or stdin EOF ends the session.
//
// It runs the game's own character code in Node through Vite's module loader, with two stand-ins:
// a canvas whose 2D context does nothing (cheek and emote textures only), and fetch reading the
// model files from public/. pose-measure.js holds the measuring; --check-browser runs it in a
// harness page as well and compares every number, which is how the stand-ins are kept honest.
import { createServer } from 'vite';
import { LANDMARKS } from './pose-landmarks.js';
import { HELD_READ_MEASURES } from './pose-held.js';
import { judgeScene, COVER_MEASURE } from './pose-rules.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paramPlugin, paramSpecs, resolveParams } from './param.js';
import { runSweep } from './param-sweep.js';
import { runMatrixSweep } from './pose-matrix-sweep.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
const ROOT = resolve(opt('root', join(import.meta.dirname, '../..')));
// --sweep runs this script again once per value, so it goes before anything takes a render slot.
if (opt('sweep')) process.exit(await (opt('matrix') ? runMatrixSweep : runSweep)(argv, fileURLToPath(import.meta.url)));
let PARAMS = [];
// A page serves the working directory, so --param there names files under it.
const IN_PAGE = argv.includes('--scene') || argv.includes('--check-browser');
if (IN_PAGE && paramSpecs(argv).length && resolve(process.cwd()) !== ROOT) { console.error(`pose: --param with --scene measures the working directory's code: run pose.mjs from ${ROOT}`); process.exit(2); }
try { PARAMS = resolveParams(paramSpecs(argv), ROOT); } catch (e) { console.error(e.message); process.exit(2); }
if (PARAMS.length && argv.includes('--serve')) { console.error('pose: --param needs a cold run: --serve keeps one server across requests'); process.exit(2); }
const OPTS = {
  under: opt('under', opt('gesture') ? 'typing' : 'idle'), gesture: opt('gesture', null), seconds: Number(opt('seconds', 2.2)),
  warm: Number(opt('warm', 1)), side: Number(opt('side', 1)) < 0 ? -1 : 1, yawToCamera: Number(opt('yaw-to-camera', 0)), view: Number(opt('view', 0)), fps: 30, rig: opt('rig', 'on') !== 'off',
};
const EVERY = Number(opt('every', 6));
const MEASURES = ['hand0Face', 'hand0Head', 'hand0HeadTop', 'hand1Face', 'hand1Head', 'hand1HeadTop', ...[0, 1].flatMap(h => LANDMARKS.map(n => `hand${h}${n}`)), 'faceCam'];
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

// The page query that picks the sim: a real seeded game (played `week` weeks by the bots, as scene.mjs does) or a mock.
const sceneSource = (req) => (req.seed != null ? `seed=${req.seed}${req.week ? `&weeks=${Number(req.week)}` : ''}` : `mock=${req.mock ?? 'floor'}`);

// Reads scene-mode options from argv flags or a --serve request's camelCase JSON keys, so both feed
// the same normalizer. get/flag/getAll abstract "a value flag", "a boolean flag" and "a repeated
// flag" over either source.
function cliSource() {
  return { get: (k, d) => opt(k, d), flag: (k) => argv.includes(`--${k}`), getAll: (k) => all(k) };
}
function jsonSource(req) {
  const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return { get: (k, d) => (camel(k) in req ? req[camel(k)] : d), flag: (k) => !!req[camel(k)], getAll: (k) => req[camel(k)] ?? [] };
}
function normalizeSceneRequest({ get, flag, getAll }) {
  const rules = getAll('expect').map((txt) => {
    const m = /^(?:([\w:]+?):)?(\w+)\s*(<=|>=|<|>)\s*(-?[\d.]+)(?:@([\d.]+))?$/.exec(String(txt).replace(/\s+/g, ''));
    if (!m || !(SCENE_MEASURES.includes(m[2]) || COVER_MEASURE.test(m[2]))) throw new Error(`pose: can't read scene rule "${txt}" (want e.g. s3:faceCovered<=0.1@0.8, measure one of ${SCENE_MEASURES.join(', ')} or cover<Hand|HandL|HandR|Bubble><EyeNear|EyeFar|EyeL|EyeR|Face>)`);
    return { text: txt, id: m[1] ?? null, measure: m[2], op: m[3], value: Number(m[4]), share: m[5] ? Number(m[5]) : 1 };
  });
  const every = Number(get('every', 6));
  const clip = get('clip', null);
  const frames = clip != null ? Array.from({ length: Math.floor((Number(clip) * 30) / every) + 1 }, (_, i) => i * every) : String(get('frames', '0')).split(',').map(Number).sort((a, b) => a - b);
  const whoRaw = get('who', null);
  const eventRaw = get('event', null);
  // The CLI spells this 'off' ('--rig off'); a --serve request may send the JSON boolean false
  // instead, so both count as off (only the string 'off' or the boolean false do; anything else,
  // including a missing field, is on).
  const rigRaw = get('rig', 'on');
  return {
    seed: get('seed', null), week: get('week', null), mock: get('mock', null), moment: get('moment', null), snapshot: get('snapshot', null),
    rig: rigRaw !== 'off' && rigRaw !== false, view: Number(get('view', 0)), warm: Number(get('warm', 30)),
    frames, who: whoRaw ? (Array.isArray(whoRaw) ? whoRaw : String(whoRaw).split(',')) : null, rules,
    patchJs: get('patch-js', null),
    cover: [...new Set([...getAll('cover').flatMap((c) => String(c).split(',')), ...rules.map((r) => r.measure).filter((m) => COVER_MEASURE.test(m))])],
    events: eventRaw ? (typeof eventRaw === 'string' ? JSON.parse(eventRaw) : eventRaw) : null,
    renderReference: flag('render-reference'), slowRaycast: flag('slow-raycast'),
    jsonPath: get('json', null), profilePath: get('profile', null),
  };
}

// The page-side sampling pass: turn to the requested view (a delta from the camera's current step,
// which is always 0 on the fresh page each request gets), warm up, reseed and sample every requested
// frame. Shared by a single cold run and every --serve request, each against its own freshly opened
// page; the page and whatever target it shows are the caller's job.
async function runSample(page, req) {
  return page.evaluate(async (o) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    // The visibility probes raycast every person every frame; a tree per mesh makes that cheap and
    // finds the same hits (harness.mjs). --slow-raycast keeps three.js's own raycast.
    await window.__fastRaycast({ install: !o.slowRaycast });
    const M = await import('/blender/checks/pose-scene.js');
    const wanted = ((o.view % 4) + 4) % 4, have = ((R.yawStep ?? 0) % 4 + 4) % 4;
    for (let i = 0, n = (wanted - have + 4) % 4; i < n; i++) { dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); }
    const initialization = window.__drawAudit();
    const warmStart = window.__wallNow();
    // A real draw allocates lazy Three.js resources whose UUIDs draw from the seeded stream, so
    // --render-reference (the only mode that samples by drawing every frame, for comparison) keeps
    // its warmup draw; the default, no-draw mode never draws at all. Either way, reseeding right
    // after puts both on the same stream from here on, so which one drew during warmup can't move a
    // later actor choice. __settle only draws on its last frame, so --warm 0 gives --render-reference
    // zero warmup draws too, pushing its own first draw (and the resource allocation it triggers)
    // past the reseed and into the sampled frames. Nothing passes --warm 0 today; a caller who does
    // should not expect it to match a separate --warm 0 run of the other mode.
    (o.renderReference ? window.__settle : window.__sample)(o.warm);
    window.__reseedGame();
    const warmMs = window.__wallNow() - warmStart;
    const warmed = window.__drawAudit();
    const skipDraw = !o.renderReference;
    const sampleStart = window.__wallNow();
    // Async, so a patch can import the sim and play weeks (await sim.tick) before the frames start.
    if (o.patchJs) await new (Object.getPrototypeOf(async () => {}).constructor)('S', 'R', o.patchJs)(S, R);
    if (o.events) R.handleEvents([].concat(o.events), S);
    const out = [];
    let at = 0;
    for (const f of o.frames) {
      (skipDraw ? window.__sample : window.__step)(Math.max(0, f - at)); at = f;
      for (const r of window.__tool(() => M.measureScene(R, S, { who: o.who, cover: o.cover }))) out.push({ frame: f, ...r });
    }
    const sampleMs = window.__wallNow() - sampleStart;
    const total = window.__drawAudit();
    return { rows: out, profile: { initialization, warmupDraws: warmed.total - initialization.total, sampleDraws: total.total - warmed.total, total, warmMs, sampleMs, samplingMode: skipDraw ? 'no-draw' : 'rendered' } };
  }, { view: req.view, warm: req.warm, patchJs: req.patchJs, events: req.events, frames: req.frames, who: req.who, cover: req.cover, renderReference: req.renderReference, slowRaycast: req.slowRaycast });
}

// The table, verdicts and (on failure) exit code a request's rows earn: identical for a single cold
// run and every --serve request, so a warm answer reads exactly like a cold one.
function printSceneResult(req, rows, profile, errors) {
  let code = 0;
  console.log(`pose: draws initialization=${profile.initialization.total}, bootstrap/warmup=${profile.warmupDraws}, sampling=${profile.sampleDraws} (${profile.samplingMode}); warmup ${profile.warmMs.toFixed(0)} ms, sampling ${profile.sampleMs.toFixed(0)} ms`);
  if (profile.samplingMode === 'no-draw' && (profile.warmupDraws !== 0 || profile.sampleDraws !== 0)) {
    console.error('POSE FAIL no-drawing assertion: WebGL draw submissions detected (see --profile); use --render-reference to diagnose');
    code = 1;
  }
  const fmt = (v, w) => (v == null ? '-' : String(v)).padStart(w);
  console.log(`POSE ${'frame'.padStart(5)} ${'id'.padEnd(10)} ${'anim'.padEnd(12)} ${'covered'.padStart(8)} ${'faceVis'.padStart(8)} ${'bodyVis'.padStart(8)} ${'faceCam'.padStart(8)} ${'facePx'.padStart(7)}  by / occluder / moment`);
  for (const r of rows) console.log(`POSE ${fmt(r.frame, 5)} ${String(r.id).padEnd(10)} ${String(r.anim ?? '-').padEnd(12)} ${fmt(r.faceCovered, 8)} ${fmt(r.faceVisible, 8)} ${fmt(r.bodyVisible, 8)} ${fmt(r.faceCam, 8)} ${fmt(r.facePx, 7)}  ${[r.coveredBy && `covered by ${r.coveredBy}`, r.occluder && r.faceVisible < 1 ? `hidden by ${r.occluder}` : null, r.moment && `${r.moment}/${r.beat}`].filter(Boolean).join('; ')}`);
  for (const r of rows) for (const [name, c] of Object.entries(r.covers ?? {})) console.log(`POSE       ${fmt(r.frame, 5)} ${String(r.id).padEnd(10)} ${name} ${c.fraction} (${c.front === 'a' ? 'A in front' : c.front === 'partial' ? 'partly covered' : 'B clear'}; ${c.of}, ${c.onScreen}/${c.samples} samples on screen)`);
  const ids = [...new Set(rows.map((r) => r.id))];
  const judged = judgeScene(rows, req.frames, req.who, req.rules);
  if (!judged.pass) code = 1;
  if (!ids.length) console.log('POSE FAIL no subjects measured');
  for (const missing of judged.missing) console.log(`POSE FAIL ${missing.id}: missing samples at frames ${missing.frames.join(', ')}`);
  for (const { id, rule, share, pass } of judged.verdicts) {
    const values = rows.filter((r) => r.id === id).map((r) => r[rule.measure]).filter(Number.isFinite);
    const range = values.length ? `; min ${Math.min(...values).toFixed(6)}, max ${Math.max(...values).toFixed(6)}` : '';
    console.log(`POSE ${pass ? 'ok  ' : 'FAIL'} ${id} ${rule.text}: ${(share * 100).toFixed(0)}% of ${req.frames.length} requested frames (want ${(rule.share * 100).toFixed(0)}%)${range}`);
  }
  if (req.jsonPath) writeFileSync(req.jsonPath, JSON.stringify(rows, null, 1));
  if (errors.length) { code = Math.max(code, 1); console.log(`pose: page errors: ${errors.slice(0, 3).join('; ')}`); }
  return { code, ids };
}

// One cold run: open the target, sample once, print, close. Identical output to before --serve
// existed.
async function sceneMode() {
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
  const t0 = performance.now();
  const { startHarness } = await import('./harness.mjs');
  const { resolveTarget, openAt } = await import('../../scripts/events/load.js');
  const req = normalizeSceneRequest(cliSource());
  const H = await startHarness({ auditDraws: true, params: PARAMS });
  let code = 0;
  try {
    const target = req.snapshot || req.moment ? resolveTarget({ snapshot: req.snapshot, event: req.moment }) : null;
    const opened = target ? await openAt(H, target, { width: 1280, height: 800, quality: 'medium' }) : await H.openScene(`quality=medium&${sceneSource(req)}&rig=${req.rig ? 1 : 0}`, { width: 1280, height: 800 });
    const { page, errors } = opened;
    const readyMs = performance.now() - t0;
    const { rows, profile } = await runSample(page, req);
    Object.assign(profile, { readyMs, mode: req.renderReference ? 'rendered-reference' : 'sampling-optimization', gl: glMode({ argv }), harnessPhases: { start: H.phases, open: opened.phases }, frames: req.frames, who: req.who });
    if (req.profilePath) writeFileSync(req.profilePath, JSON.stringify(profile, null, 2));
    const { code: printCode, ids } = printSceneResult(req, rows, profile, errors);
    code = printCode;
    console.log(`pose: scene, ${ids.length} people, ${req.frames.length} frames in ${(performance.now() - t0).toFixed(0)} ms`);
  } finally {
    await H.close();
  }
  return code;
}

// A warm scene server: launch the browser and Vite server once (most of a cold command's own time),
// then answer each stdin request (one JSON object per line, same fields as the CLI's --scene flags in
// camelCase) by opening a fresh page against it, the same way a cold run would. A fresh page every
// time means a request's rows always match what a cold run of the same request would print; reusing
// an already-open page across requests does not (its camera and character animation state keep
// easing toward whatever the last request left as their goal, instead of starting fresh), so this
// does not attempt it. `{"quit": true}` or stdin EOF ends the session.
async function serveMode() {
  // Read from stdin before anything else touches it: the render lock re-execs this same command
  // under a lock script that inherits our stdin fd (holdRenderLock), and later steps import modules
  // asynchronously, both of which give a piped, already-buffered stdin a chance to be drained by
  // something other than us before we get to it. Starting the readline interface first wins that
  // race: it puts Node's own stream reading first in line for the pipe's bytes.
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = rl[Symbol.asyncIterator]();
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
  const { startHarness } = await import('./harness.mjs');
  const { resolveTarget, openAt } = await import('../../scripts/events/load.js');
  const H = await startHarness({ auditDraws: true });
  let worst = 0, n = 0;
  async function handle(req) {
    const t0 = performance.now();
    const target = req.snapshot || req.moment ? resolveTarget({ snapshot: req.snapshot, event: req.moment }) : null;
    const opened = target
      ? await openAt(H, target, { width: 1280, height: 800, quality: 'medium' })
      : await H.openScene(`quality=medium&${sceneSource(req)}&rig=${req.rig ? 1 : 0}`, { width: 1280, height: 800 });
    const { page, errors } = opened;
    try {
      const readyMs = performance.now() - t0;
      const { rows, profile } = await runSample(page, req);
      Object.assign(profile, { readyMs, mode: req.renderReference ? 'rendered-reference' : 'sampling-optimization', gl: glMode({ argv }), harnessPhases: { start: H.phases, open: opened.phases }, frames: req.frames, who: req.who });
      if (req.profilePath) writeFileSync(req.profilePath, JSON.stringify(profile, null, 2));
      const { code, ids } = printSceneResult(req, rows, profile, errors);
      worst = Math.max(worst, code);
      console.log(`POSE serve ${n} code=${code} people=${ids.length} frames=${req.frames.length} ms=${(performance.now() - t0).toFixed(0)}`);
    } finally {
      await page.close();
    }
  }
  console.log('POSE serve ready');
  try {
    for (let next = await lines.next(); !next.done; next = await lines.next()) {
      const trimmed = next.value.trim();
      if (!trimmed) continue;
      n++;
      let json;
      try { json = JSON.parse(trimmed); } catch (e) { console.log(`POSE serve ${n} code=2 parse error: ${e.message}`); worst = Math.max(worst, 2); continue; }
      if (json.quit) break;
      try { await handle(normalizeSceneRequest(jsonSource(json))); }
      catch (e) { console.log(`POSE serve ${n} code=2 error: ${e.message}`); worst = Math.max(worst, 2); }
    }
  } finally {
    rl.close();
    await H.close();
  }
  return worst;
}

async function checkBrowser(frames) {
  const { startHarness } = await import('./harness.mjs');
  const H = await startHarness({ params: PARAMS });
  try {
    const { page } = await H.openScene('quality=medium&mock=floor', { width: 320, height: 200 });
    const b = await page.evaluate(async (o) => (await import('/blender/checks/pose-measure.js')).playPose(o), OPTS);
    const flat = (f) => [f.t, ...f.eyes, ...f.forward, ...f.head, ...f.hands.flat(), ...(f.joints ? Object.values(f.joints).flat() : []), ...Object.values(f.contact).map((v) => v ?? 0), f.faceCam];
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

const SCENE_MEASURES = ['faceCovered', 'faceVisible', 'bodyVisible', 'faceCam', 'facePx', 'heldGap', 'heldHeadDepth', 'heldTorsoDepth', ...HELD_READ_MEASURES];

// The page a browser check opens serves this checkout, so it can only check this checkout's code.
const browserMode = argv.includes('--scene') ? '--scene' : argv.includes('--check-browser') ? '--check-browser' : null;
if (browserMode && ROOT !== resolve(join(import.meta.dirname, '../..'))) {
  console.error(`pose: ${browserMode} measures the page's own checkout, not --root; run pose.mjs from ${ROOT} (copy blender/checks/pose*.js there) to check it`);
  process.exit(2);
}
if (argv.includes('--scene')) process.exit(argv.includes('--serve') ? await serveMode() : await sceneMode());

// The browser check renders, so it takes a render slot first; taking one re-runs this script under
// the lock, which must happen before anything is printed.
if (argv.includes('--check-browser')) {
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
}
const t0 = performance.now();
standIns();
const vite = await createServer({ root: ROOT, configFile: false, plugins: PARAMS.length ? [paramPlugin(PARAMS)] : [], server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let code = 0;
try {
  const P0 = await vite.ssrLoadModule(join(import.meta.dirname, 'pose-measure.js'));
  // The slap is two actors, so it plays through pose-slap.js; every other gesture is playPose as it was.
  const P = OPTS.gesture === 'slap' ? { ...P0, playPose: (await vite.ssrLoadModule(join(import.meta.dirname, 'pose-slap.js'))).withSlap(P0.playPose) } : P0;
  if (opt('matrix')) {
    const X = await vite.ssrLoadModule(join(import.meta.dirname, 'pose-matrix.js'));
    if (!OPTS.gesture) throw new Error('pose: --matrix needs --gesture <name>');
    const measures = String(opt('measure', '')).split(',').map((s) => s.trim()).filter(Boolean);
    const rules = all('expect').map((r) => X.parseRule(r, measures));
    if (!measures.length) throw new Error('pose: --matrix needs --measure <m1,m2> (e.g. coverHandEyeNear,faceCam,clearance)');
    const axes = X.parseMatrix(opt('matrix'));
    const result = await X.runMatrix({ playPose: P.playPose, gesture: OPTS.gesture, axes, measures, rules, seconds: OPTS.seconds, warm: OPTS.warm, fps: OPTS.fps });
    for (const l of X.formatMatrix(result, rules, OPTS.gesture)) console.log(l);
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(result, null, 1));
    console.log(`pose: ${result.cells.length} cells in ${(performance.now() - t0).toFixed(0)} ms`);
    code = rules.length && result.cells.some((c) => !c.pass) ? 1 : 0;
    // One picture, of the worst cell at its worst frame, only when asked (it needs the GPU and its lock).
    if (opt('crop')) {
      const w = X.worstOf(result.cells);
      const v = w.verdicts.find((x) => !x.pass) ?? w.verdicts[0];
      const args = [join(import.meta.dirname, 'pose-crop.mjs'), '--gesture', OPTS.gesture, '--posture', w.posture, '--build', String(w.build), '--rig', w.rig, '--view', String(w.view), '--side', String(w.side), '--accessory', w.accessory, '--t', String(v?.worstT ?? OPTS.warm + 1), '--warm', String(OPTS.warm), '--seconds', String(OPTS.seconds), '--out', opt('crop')];
      const r = spawnSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
      console.log(`pose: crop of the worst cell (${X.rowLabel(w, axes)} view ${w.view}, t ${v?.worstT ?? '-'}): ${r.status === 0 ? opt('crop') : `failed (exit ${r.status})`}`);
    }
    await vite.close();
    process.exit(code);
  }
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
