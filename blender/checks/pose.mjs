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
//        [--slow-raycast] [--render-reference] [--browser] [--profile <file>] [--json out.json]
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
// --scene plays on the studio engine (scripts/studio/page-host.mjs, a 1280x800 Medium scene in its own
// Node process), drawing nothing. A request that needs a page runs in a harness page under the render
// lock instead, also drawing nothing (browserReason: --browser, --snapshot, --moment, --render-reference,
// a faceCovered rule or bubble cover, which read the page's label layout, or a --patch-js that calls
// the page's game controls). The engine lays out no labels, so its faceCovered and coveredBy are null.
// For each person: faceCovered (how much of the head
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
// --serve answers every request in a harness page: it keeps the browser and Vite server open across
// requests instead of paying their startup every time, but opens a fresh page for each one, so results always match a cold run exactly: each
// stdin line is a JSON object with the same fields as the flags above in camelCase (mock, moment,
// snapshot, patchJs, event, warm, frames, clip, every, who, view, rig, expect (an array), slowRaycast,
// renderReference, profile, json), printed and judged exactly like a single cold run, then a
// `POSE serve <n> code=<0|1|2> ...` summary line. `{"quit": true}` or stdin EOF ends the session.
//
// It runs the game's own character code in Node on the studio engine (scripts/studio: its platform, a
// canvas whose 2D context does nothing and fetch reading public/, and its loader, native imports with no
// Vite). pose-measure.js holds the measuring; --check-browser runs it in a harness page as well and
// compares every number, and --matrix --browser runs the whole matrix in one (--rows prints a CELL line
// per cell for scripts/studio/parity.mjs), which is how the engine is kept honest.
import { registerHooks } from 'node:module';
import { LANDMARKS } from './pose-landmarks.js';
import { HELD_READ_MEASURES } from './pose-held.js';
import { judgeScene, COVER_MEASURE } from './pose-rules.js';
import { writeFileSync } from 'node:fs';
import { fork, spawnSync } from 'node:child_process';
import { cpus } from 'node:os';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyParams, currentText, paramSpecs, resolveParams } from './param.js';
import { runSweep } from './param-sweep.js';
import { runMatrixSweep } from './pose-matrix-sweep.js';

const argv = process.argv.slice(2);
// A bare --matrix (last, or followed by another flag) is the whole matrix: every axis at its default.
// rig=on,off is every gesture's rig default, so it leaves each axis as the gesture would have it.
{ const i = argv.indexOf('--matrix'); if (i >= 0 && (argv[i + 1] === undefined || argv[i + 1].startsWith('--'))) argv.splice(i + 1, 0, 'rig=on,off'); }
// Axes split by spaces reach argv as loose words the matrix would never read: refused, with the joined flag.
{
  const AXIS = /^(views|postures|builds|rig|accessory|side|cause)=/;
  const loose = argv.filter((a, i) => AXIS.test(a) && argv[i - 1] !== '--matrix');
  if (loose.length) {
    const head = argv[argv.indexOf('--matrix') + 1];
    console.error(`pose: matrix axes are one comma-joined word: --matrix ${[head, ...loose].filter((a) => a && AXIS.test(a)).join(',')} (got ${loose.join(' ')} as separate words)`);
    process.exit(2);
  }
}
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));
const ROOT = resolve(opt('root', join(import.meta.dirname, '../..')));
// --sweep runs this script again once per value, so it goes before anything takes a render slot.
// A swept name that can't be resolved (not found, or declared in two files) is refused before any run;
// each one's value in source is printed first, so the sweep's range can be chosen around it.
if (opt('sweep')) {
  const swept = all('sweep').map((s) => { const i = s.indexOf('='); return i < 1 ? { spec: s } : { spec: `${s.slice(0, i)}=${s.slice(i + 1).split(',')[0]}`, values: s.slice(i + 1) }; });
  for (const w of swept) {
    let p;
    try { [p] = resolveParams([w.spec], ROOT); } catch (e) {
      // The refusal's suggested flags, as --sweep with every value.
      console.error(e.message.replace(/--param (\S+)=\S+/g, (_, head) => `--sweep '${head}=${w.values ?? ''}'`).replace(/ \(the same file: prefix works in --sweep\)/, ''));
      process.exit(2);
    }
    const now = currentText(p);
    if (now !== null) console.log(`SWEEP ${w.spec.slice(0, w.spec.indexOf('='))} is ${now} in ${p.file.slice(ROOT.length + 1)}`);
  }
}
if (opt('sweep')) process.exit(await (opt('matrix') ? runMatrixSweep : runSweep)(argv, fileURLToPath(import.meta.url)));
let PARAMS = [];
// A page serves the working directory, so --param there names files under it.
const MATRIX_BROWSER = !!opt('matrix') && argv.includes('--browser');
const IN_PAGE = argv.includes('--scene') || argv.includes('--check-browser') || MATRIX_BROWSER;
if (IN_PAGE && paramSpecs(argv).length && resolve(process.cwd()) !== ROOT) { console.error(`pose: --param with --scene measures the working directory's code: run pose.mjs from ${ROOT}`); process.exit(2); }
try { PARAMS = resolveParams(paramSpecs(argv), ROOT); } catch (e) { console.error(e.message); process.exit(2); }
if (PARAMS.length && argv.includes('--serve')) { console.error('pose: --param needs a cold run: --serve keeps one server across requests'); process.exit(2); }
const OPTS = {
  under: opt('under', opt('gesture') ? 'typing' : 'idle'), gesture: opt('gesture', null), seconds: Number(opt('seconds', 2.2)),
  warm: Number(opt('warm', 1)), side: Number(opt('side', 1)) < 0 ? -1 : 1, yawToCamera: Number(opt('yaw-to-camera', 0)), view: Number(opt('view', 0)), fps: 30, rig: opt('rig', 'on') !== 'off',
};
const EVERY = Number(opt('every', 6));
// --matrix on the engine spreads its cells over --jobs processes (default a quarter of the cores), each
// playing every n-th cell (--slice k/n, internal) and handing its cells back over IPC.
const JOBS = Number(opt('jobs', Math.max(1, cpus().length >> 2)));
const SLICE = opt('slice') ? opt('slice').split('/').map(Number) : null;
if (!(Number.isInteger(JOBS) && JOBS >= 1)) { console.error(`pose: --jobs wants a whole number of at least 1 (got ${opt('jobs')})`); process.exit(2); }

async function matrixOnEngine(total) {
  const n = Math.min(JOBS, total);
  const drop = new Set(['--jobs', '--json', '--crop', '--slice']);
  const args = argv.filter((a, i) => !drop.has(a) && !drop.has(argv[i - 1]) && a !== '--rows');
  const children = new Set();
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { for (const p of children) p.kill('SIGTERM'); process.exit(143); });
  const parts = await Promise.all(Array.from({ length: n }, (_, k) => new Promise((done, fail) => {
    const p = fork(fileURLToPath(import.meta.url), [...args, '--slice', `${k}/${n}`], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.add(p);
    let got = null, err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('message', (m) => { got = m; });
    p.on('exit', (code, signal) => { children.delete(p); if (got) done(got.cells); else fail(new Error(`pose: matrix slice ${k}/${n} exited ${code ?? signal}: ${err.trim().split('\n').slice(-3).join(' | ')}`)); });
  })));
  // Slice k holds cells k, k + n, k + 2n...: interleaved back into matrix order.
  return Array.from({ length: total }, (_, i) => parts[i % n][Math.floor(i / n)]);
}
const MEASURES = ['hand0Face', 'hand0Head', 'hand0HeadTop', 'hand1Face', 'hand1Head', 'hand1HeadTop', ...[0, 1].flatMap(h => LANDMARKS.map(n => `hand${h}${n}`)), 'faceCam'];
const valueOf = (f, m) => (m === 'faceCam' ? f.faceCam : f.contact[m]);

// The studio engine under the measuring modules: its platform (a canvas that draws nothing, fetch reading
// ROOT's public/, a frame clock and seeded Math.random, as a harness page has) and its loader (ROOT's src/
// by native import, --param applied as each module loads). The modules import the game by absolute path
// ('/src/render/character.js'), as a page does; three and three-mesh-bvh come from ROOT, so the game and
// the measures share one three.js. Returns a loader for this directory's modules.
async function engine() {
  const { installPlatform } = await import('../../scripts/studio/platform.mjs');
  const { installLoader } = await import('../../scripts/studio/loader.mjs');
  installPlatform(ROOT, { quality: 'medium' });
  const byFile = Map.groupBy(PARAMS, (p) => p.file);
  installLoader({ root: ROOT, transform: (file, source) => (byFile.has(file) ? applyParams(source, byFile.get(file)) : source) });
  const rootUrl = pathToFileURL(`${ROOT}/`);
  const fromRoot = new URL('package.json', rootUrl).href;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier.startsWith('/src/')) return next(new URL(specifier.slice(1), rootUrl).href, context);
      if (/^three(-mesh-bvh)?(\/|$)/.test(specifier) && context.parentURL !== fromRoot) {
        try { return next(specifier, { ...context, parentURL: fromRoot }); } catch { /* ROOT has no copy: the tool's own */ }
      }
      return next(specifier, context);
    },
  });
  return (name) => import(pathToFileURL(join(import.meta.dirname, name)).href);
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

// The sampling pass (pose-scene-page.js), against a freshly opened page or engine scene; the page and
// whatever target it shows are the caller's job.
const sampleArg = (req) => ({ view: req.view, warm: req.warm, patchJs: req.patchJs, events: req.events, frames: req.frames, who: req.who, cover: req.cover, renderReference: req.renderReference, slowRaycast: req.slowRaycast });
async function runSample(page, req) {
  const { scenePage } = await import('./pose-scene-page.js');
  return page.evaluate(scenePage, sampleArg(req));
}

// Why a request needs a browser page, or null when the studio engine answers it. Label and bubble
// rectangles come from the page's CSS layout, a snapshot or moment loads through the game's own
// continueGame, and --render-reference draws.
function browserReason(req) {
  if (argv.includes('--browser')) return '--browser';
  if (req.snapshot || req.moment) return req.snapshot ? '--snapshot' : '--moment';
  if (req.renderReference) return '--render-reference';
  if (/__HITL\s*\.\s*(?!state\b)\w/.test(req.patchJs ?? '')) return "--patch-js uses the page's game controls";
  if (req.rules.some((r) => r.measure === 'faceCovered')) return 'a faceCovered rule needs label rectangles';
  if (req.cover.some((c) => /Bubble/.test(c))) return 'a bubble cover needs label rectangles';
  return null;
}

// The same pass on the studio engine, in a fresh Node process: a 1280x800 Medium page, no browser and no
// render slot. Labels are not laid out there, so faceCovered and coveredBy are null and overlays hold
// emotes only.
async function engineSample(req) {
  const { runCases } = await import('../../scripts/studio/page-host.mjs');
  const source = req.seed != null ? { seed: Number(req.seed), weeks: req.week ? Number(req.week) : 0 } : { mock: req.mock ?? 'floor' };
  const page = { ...source, quality: 'medium', rig: req.rig, width: 1280, height: 800, params: PARAMS };
  const [r] = await runCases([{ page, module: fileURLToPath(new URL('./pose-scene-page.js', import.meta.url)), fn: 'scenePage', arg: sampleArg(req) }], { jobs: 1 });
  if (r.error) throw new Error(`pose: engine: ${r.error}`);
  for (const row of r.value.rows) { row.faceCovered = null; row.coveredBy = null; }
  return r.value;
}

// The table, verdicts and (on failure) exit code a request's rows earn: identical for a single cold
// run and every --serve request, so a warm answer reads exactly like a cold one.
function printSceneResult(req, rows, profile, errors) {
  let code = 0;
  if (profile.samplingMode === 'engine') console.log(`pose: studio engine, nothing drawn, no label rectangles (--browser measures faceCovered); warmup ${profile.warmMs.toFixed(0)} ms, sampling ${profile.sampleMs.toFixed(0)} ms`);
  else console.log(`pose: draws initialization=${profile.initialization.total}, bootstrap/warmup=${profile.warmupDraws}, sampling=${profile.sampleDraws} (${profile.samplingMode}); warmup ${profile.warmMs.toFixed(0)} ms, sampling ${profile.sampleMs.toFixed(0)} ms`);
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

// One cold run: open the target, sample once, print, close. On the studio engine unless the request
// needs a browser page (browserReason).
async function sceneMode() {
  const t0 = performance.now();
  let req;
  try { req = normalizeSceneRequest(cliSource()); } catch (e) { console.error(e.message); return 2; }
  const { MOCK_SCENARIOS } = await import('../../src/dev/mockSim.js');
  if (req.mock != null && !MOCK_SCENARIOS.includes(req.mock)) { console.error(`pose: no mock scenario "${req.mock}" (want one of ${MOCK_SCENARIOS.join(', ')})`); return 2; }
  const why = browserReason(req);
  if (!why) {
    const { rows, profile } = await engineSample(req);
    profile.samplingMode = 'engine';
    Object.assign(profile, { readyMs: null, mode: 'engine', frames: req.frames, who: req.who });
    if (req.profilePath) writeFileSync(req.profilePath, JSON.stringify(profile, null, 2));
    const { code, ids } = printSceneResult(req, rows, profile, []);
    console.log(`pose: scene, ${ids.length} people, ${req.frames.length} frames in ${(performance.now() - t0).toFixed(0)} ms`);
    return code;
  }
  // The render lock re-runs this command under it, so nothing is printed before this.
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
  console.log(`pose: scene in a browser page (${why})`);
  const { startHarness } = await import('./harness.mjs');
  const { resolveTarget, openAt } = await import('../../scripts/events/load.js');
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

// A harness page on this checkout, running fn(arg) there; closed after. It runs before the engine is
// installed: the engine replaces this process's clock and globals, which the browser driver needs.
async function inPage(fn, arg) {
  const { startHarness } = await import('./harness.mjs');
  const H = await startHarness({ params: PARAMS });
  try {
    const { page, errors } = await H.openScene('quality=medium&mock=floor', { width: 320, height: 200 });
    const out = await page.evaluate(fn, arg);
    if (errors.length) throw new Error(`pose: page errors: ${errors.slice(0, 3).join('; ')}`);
    return out;
  } finally {
    await H.close();
  }
}

function compareBrowser(frames, b) {
  const flat = (f) => [f.t, ...f.eyes, ...f.forward, ...f.head, ...f.hands.flat(), ...(f.joints ? Object.values(f.joints).flat() : []), ...Object.values(f.contact).map((v) => v ?? 0), f.faceCam];
  let worst = 0, at = null;
  if (b.frames.length !== frames.length) { console.log(`POSE FAIL browser check: ${b.frames.length} frames in the page, ${frames.length} in Node`); return 1; }
  frames.forEach((f, i) => { const x = flat(f), y = flat(b.frames[i]); x.forEach((v, k) => { const d = Math.abs(v - y[k]); if (d > worst) { worst = d; at = `frame ${i} value ${k}`; } }); });
  const ok = worst <= 1e-3;
  console.log(`POSE ${ok ? 'ok  ' : 'FAIL'} browser check: ${frames.length} frames, largest difference ${worst.toExponential(2)}${at ? ` (${at})` : ''}${ok ? '' : ': the engine no longer matches the page'}`);
  return ok ? 0 : 1;
}

const SCENE_MEASURES = ['faceCovered', 'faceVisible', 'bodyVisible', 'faceCam', 'facePx', 'heldGap', 'heldHeadDepth', 'heldTorsoDepth', ...HELD_READ_MEASURES];

// The page a browser check opens serves this checkout, so it can only check this checkout's code.
const browserMode = argv.includes('--scene') ? '--scene' : argv.includes('--check-browser') ? '--check-browser' : MATRIX_BROWSER ? '--browser' : null;
if (browserMode && ROOT !== resolve(join(import.meta.dirname, '../..'))) {
  console.error(`pose: ${browserMode} measures the page's own checkout, not --root; run pose.mjs from ${ROOT} (copy blender/checks/pose*.js there) to check it`);
  process.exit(2);
}
if (argv.includes('--scene')) process.exit(argv.includes('--serve') ? await serveMode() : await sceneMode());

// A page renders, so it takes a render slot first; taking one re-runs this script under the lock,
// which must happen before anything is printed.
if (argv.includes('--check-browser') || MATRIX_BROWSER) {
  const { holdRenderLock, glMode } = await import('../../scripts/lib/gl.js');
  holdRenderLock(glMode({ argv }));
}
// Wall time, read before the engine swaps performance.now for its frame clock.
const wallNow = performance.now.bind(performance);
const t0 = wallNow();
let code = 0;
try {
  if (opt('matrix')) {
    // pose-matrix.js imports nothing, so the axes and rules are read before any engine or page starts.
    const X = await import('./pose-matrix.js');
    if (!OPTS.gesture) throw new Error('pose: --matrix needs --gesture <name>');
    // Neither --measure nor --expect: the gesture's own pass rule (PRESETS), said on the first line.
    const preset = !opt('measure') && !all('expect').length ? X.PRESETS[OPTS.gesture] : null;
    if (preset && !SLICE) console.log(`pose: ${OPTS.gesture}'s pass rule: --measure ${preset.measures.join(',')} ${preset.rules.map((r) => `--expect '${r}'`).join(' ')}`);
    // The consts that tune this gesture, as source holds them (--param overrides are on the command line).
    const tuned = X.PRESETS[OPTS.gesture]?.tunedBy;
    if (tuned && !SLICE) {
      const now = tuned.map((s) => { try { const [p] = resolveParams([`${s}=0`], ROOT); const v = currentText(p); return v === null ? null : { file: s.split(':')[0], text: `${p.name} = ${v}` }; } catch { return null; } }).filter(Boolean);
      const byFile = Map.groupBy(now, (x) => x.file);
      if (now.length) console.log(`pose: tuned by ${[...byFile].map(([f, xs]) => `${xs.map((x) => x.text).join(', ')} in ${f}`).join('; ')} (docs/toolkit/pose/constants-map.md says which moves what)`);
    }
    const measures = preset ? [...preset.measures] : String(opt('measure', '')).split(',').map((s) => s.trim()).filter(Boolean);
    const rules = (preset ? preset.rules : all('expect')).map((r) => X.parseRule(r, measures));
    if (!measures.length) throw new Error(`pose: --matrix needs --measure <m1,m2> (e.g. coverHandEyeNear,faceCam,clearance); ${Object.keys(X.PRESETS).join(' and ')} have a pass rule used without one`);
    const axes = X.parseMatrix(opt('matrix'), OPTS.gesture);
    const run = { gesture: OPTS.gesture, axes, measures, rules, seconds: OPTS.seconds, warm: OPTS.warm, fps: OPTS.fps };
    let result;
    if (MATRIX_BROWSER) {
      result = await inPage(async (o) => {
        const P = await import('/blender/checks/pose-measure.js');
        // The slap is two actors, so it plays through pose-slap.js.
        const playPose = o.gesture === 'slap' ? (await import('/blender/checks/pose-slap.js')).withSlap(P.playPose) : P.playPose;
        return (await import('/blender/checks/pose-matrix.js')).runMatrix({ ...o, playPose });
      }, run);
    } else if (SLICE) {
      const load = await engine();
      const P = await load('pose-measure.js');
      const playPose = OPTS.gesture === 'slap' ? (await load('pose-slap.js')).withSlap(P.playPose) : P.playPose;
      const { cells } = await X.runMatrix({ ...run, playPose, slice: SLICE });
      await new Promise((done) => process.send({ cells }, done));
      process.exit(0);
    } else {
      result = { axes, cells: await matrixOnEngine(X.cellsOf(axes).length) };
    }
    for (const l of X.formatMatrix(result, rules, OPTS.gesture)) console.log(l);
    // One line per cell for parity.mjs: every axis in the name, the verdicts and ranges as the value.
    if (argv.includes('--rows')) {
      for (const c of result.cells) console.log(`CELL ${c.pass ? 'ok' : 'FAIL'} ${c.posture} b${c.build} rig-${c.rig} ${c.accessory} ${c.cause} side${c.side} view${c.view} ${JSON.stringify({ error: c.error ?? null, judged: c.judged, stat: c.stat, verdicts: c.verdicts.map(({ share, gap, frames, worstT, na }) => ({ share, gap: Number.isFinite(gap) ? gap : String(gap), frames, worstT, na: !!na })) })}`);
    }
    if (opt('json')) writeFileSync(opt('json'), JSON.stringify(result, null, 1));
    console.log(`pose: ${result.cells.length} cells in ${(wallNow() - t0).toFixed(0)} ms${MATRIX_BROWSER ? ' (browser)' : ''}`);
    code = rules.length && result.cells.some((c) => !c.pass) ? 1 : 0;
    // One picture, of the worst cell at its worst frame, only when asked (it needs the GPU and its lock).
    if (opt('crop')) {
      const w = X.worstOf(result.cells);
      const v = w.verdicts.find((x) => !x.pass) ?? w.verdicts[0];
      const args = [join(import.meta.dirname, 'pose-crop.mjs'), '--gesture', OPTS.gesture, '--posture', w.posture, '--build', String(w.build), '--rig', w.rig, '--view', String(w.view), '--side', String(w.side), '--accessory', w.accessory, '--t', String(v?.worstT ?? OPTS.warm + 1), '--warm', String(OPTS.warm), '--seconds', String(OPTS.seconds), '--out', opt('crop')];
      const r = spawnSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
      console.log(`pose: crop of the worst cell (${X.rowLabel(w, axes)} view ${w.view}, t ${v?.worstT ?? '-'}): ${r.status === 0 ? opt('crop') : `failed (exit ${r.status})`}`);
    }
    process.exit(code);
  }
  // The browser check's page runs first: the engine then takes over this process.
  const browser = argv.includes('--check-browser') ? await inPage(async (o) => (await import('/blender/checks/pose-measure.js')).playPose(o), OPTS) : null;
  const load = await engine();
  const P0 = await load('pose-measure.js');
  // The slap is two actors, so it plays through pose-slap.js; every other gesture is playPose as it was.
  const P = OPTS.gesture === 'slap' ? { ...P0, playPose: (await load('pose-slap.js')).withSlap(P0.playPose) } : P0;
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
  if (browser) code = Math.max(code, compareBrowser(frames, browser));
  console.log(`pose: ${frames.length} frames in ${(wallNow() - t0).toFixed(0)} ms`);
} catch (e) {
  console.error(e.message);
  code = 2;
}
process.exit(code);
