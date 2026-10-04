// Headless frame-time benchmark of production builds. Run it under timeout
// (timeout 1800 node scripts/perf/bench.js ...), not under nice: builds run niced, and so does the
// browser unless it is pinned to a few cores, where nice would measure the scheduler instead of the
// game. It takes a render lock (a GPU slot, or the software lock) through with-render-lock.sh one
// scene at a time, so CI render checks can run between scenes.
//
// node scripts/perf/bench.js [--gpu|--software] [--scenes garage,floor,hq,music,late]
//   [--quality low,high] [--runs 3] [--warmup 3] [--seconds 8] [--size 1280x720]
//   [--cores 2 | --cpus 30-31] [--refs <git-ref>,<git-ref>] [--json out.json] [--profile]
//   [--quiet [minutes]]
// --quiet holds a quiet window (scripts/lib/quiet.sh, at most two a day) from after the builds until
// the last scene, for a clean baseline: new local CI and other software renders wait for it. It
// fails with quiet.sh's reason when the window is refused or the machine doesn't drain. Results
// measured after the window's time ran out are marked.
// --profile samples the main thread with the CPU profiler while recording and prints the functions
// with the most self time per scene (module and line, from the unminified build).
// --phases drains the GPU at every framebuffer switch in a render and prints each pass's median time
// and draw count (shadow, scene, tone map, FXAA), numbered in render order. It adds a sync per pass, so
// read it as proportions, and take frame time from a run without it.
// --cores N pins the browser (not the build) to the last N cores, a weak-device proxy; --cpus names them.
// GL comes from scripts/lib/gl.js: the GPU unless --software or HITL_GL=software. SwiftShader pinned
// with --cores 2 stands in for a weak device. Without --refs it measures the working tree. With --refs it builds each
// ref in a temporary worktree and alternates between them run by run, so machine load hits every
// build alike; compare builds from the same invocation, not across invocations.
// Frame rate is uncapped (no vsync), and each frame ends with a one-pixel readback that waits for
// the GPU, so frame time is the whole frame's cost. Per scene and quality, the median across runs:
//   p50/p95  interval between frames (ms)            cpu     main-thread rAF work per frame (ms)
//   render   renderer.render per frame, GPU included  best    the fastest run's render
//   calls/tris/meshes/geo/tex/prog  renderer.info
//   heap     JS heap after a forced GC (MB)           dom     DOM nodes
//   mut/s    DOM mutation records per second (UI churn)
import { chromium } from 'playwright';
import { preview } from 'vite';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus, loadavg } from 'node:os';
import { arg, median, quantile } from './stats.js';
import { glMode, launchChromium } from '../lib/gl.js';
import { waitForBoot } from '../lib/boot.js';

const ROOT = resolve(import.meta.dirname, '../..');
const GL = glMode();
const SCENES = String(arg('scenes', 'garage,floor,hq,music,late')).split(',');
const QUALITIES = String(arg('quality', 'low,high')).split(',');
const RUNS = Number(arg('runs', 3));
const WARMUP = Number(arg('warmup', 3));
const SECONDS = Number(arg('seconds', 8));
const [W, H] = String(arg('size', '1280x720')).split('x').map(Number);
const REFS = typeof arg('refs', null) === 'string' ? arg('refs').split(',') : null;
const REF_DIR = join(ROOT, '.vite/perf-refs');
const PROFILE = !!arg('profile', false);
const PHASES = !!arg('phases', false);
const QUIET = arg('quiet', null) === null ? null : arg('quiet') === true ? 20 : Number(arg('quiet'));
const CPUS = typeof arg('cpus', null) === 'string' ? arg('cpus')
  : arg('cores', null) ? `${cpus().length - Number(arg('cores'))}-${cpus().length - 1}` : null;

// Holds a render lock (a GPU slot, or the software lock for SwiftShader) until release() is called.
// Inside a caller that already holds a covering lock, with-render-lock.sh runs straight through.
async function takeRenderLock() {
  const p = spawn('bash', [join(ROOT, 'scripts/with-render-lock.sh'), `--${GL}`, 'sh', '-c', 'echo locked; read _'], { stdio: ['pipe', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    p.stdout.once('data', ok);
    p.once('exit', (code) => fail(new Error(`render lock: with-render-lock.sh exited ${code}`)));
  });
  return () => { p.stdin.end(); };
}

// Holds a quiet window until release() is called. quiet.sh's own PID names the window, so marking
// this process as its holder lets bench's own software render locks pass through it.
async function takeQuietWindow(minutes) {
  const p = spawn('bash', [join(ROOT, 'scripts/lib/quiet.sh'), 'run', '--minutes', String(minutes), '--', 'sh', '-c', 'echo held; read _'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const w = { ended: false };
  await new Promise((ok, fail) => {
    p.stdout.once('data', ok);
    p.once('exit', (code) => fail(new Error(`quiet window: quiet.sh exited ${code}`)));
  });
  p.removeAllListeners('exit');
  p.once('exit', () => { w.ended = true; });
  process.env.HITL_QUIET_HOLDER = String(p.pid);
  w.release = () => new Promise((ok) => {
    if (w.ended) return ok();
    p.once('exit', ok);
    p.stdin.end();
  });
  return w;
}

// A wrapper that starts the browser pinned to CPUS with taskset, or niced when it may use every core.
function browserExecutable() {
  const full = chromium.executablePath();
  const shell = full.replace('/chromium-', '/chromium_headless_shell-').replace(/chrome-linux64\/chrome$/, 'chrome-headless-shell-linux64/chrome-headless-shell');
  const file = join(ROOT, '.vite/perf-chrome.sh');
  mkdirSync(dirname(file), { recursive: true });
  const run = CPUS ? `taskset -c ${CPUS}` : GL === 'software' ? 'nice -n 10' : '';
  writeFileSync(file, `#!/bin/sh\nexec ${run} '${existsSync(shell) ? shell : full}' "$@"\n`, { mode: 0o755 });
  return file;
}

// A late-game company: the sensible bot plays seed 1 to this week, saved the way that build saves.
const LATE_WEEK = 400;
async function lateSave(root) {
  const { runBot } = await import(pathToFileURL(join(root, 'src/sim/bots.js')).href);
  const { saveGame } = await import(pathToFileURL(join(root, 'src/save/save.js')).href);
  const { state } = runBot('sensible', 1, LATE_WEEK);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  if (!saveGame(state, storage)) throw new Error('late save failed');
  return { entries: [...mem.entries()], week: state.week, stage: state.officeStage, staff: state.staff.length, over: !!state.gameOver };
}

// Keeps a live game moving: resolves decisions and closes panels and cards, like a player would.
const KEEP_PLAYING = `(() => {
  const H = window.__HITL;
  if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 });
  for (let i = 0; i < 12; i++) {
    const b = [...document.querySelectorAll('button')].find((x) => x.getClientRects().length && ['Got it', 'Onward'].includes(x.textContent.trim()));
    if (b) b.click();
    else if (H.clock.busy) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    else break;
  }
})()`;

const MUSIC_NIGHT = `(() => {
  const s = window.__HITL.state;
  const here = s.staff.filter((p) => p.mood !== 'away' && !p.remote);
  window.__HITL.emit([{ type: 'incentive', staffId: here[0].id, reward: 'music_night', genre: 'corporate_synthwave', dancers: here.slice(1, 5).map((p) => p.id) }]);
})()`;

// Puts a disk duplicator and a retail display on the first free tiles, so the pre-internet scenes draw
// both models. The page keeps the placed ids on window.__perfProps for the report.
const PREINTERNET_PROPS = `(() => {
  const H = window.__HITL;
  H.state.cash = Math.max(H.state.cash, 1e9);
  const got = {};
  for (const itemId of ['disk_duplicator', 'retail_shelf']) {
    outer: for (let y = 0; y < 16; y++) for (let x = 0; x < 21; x++) for (const rot of [0, 1]) {
      const r = H.dispatch({ type: 'placeItem', itemId, x, y, rot });
      if (r?.ok) { got[itemId] = [x, y, rot]; break outer; }
    }
  }
  window.__perfProps = got;
})()`;

const SCENE_DEFS = {
  garage: { query: 'mock=garage' },
  floor: { query: 'mock=floor' },
  hq: { query: 'mock=hq' },
  music: { query: 'mock=floor', setup: MUSIC_NIGHT },
  late: { query: '', late: true },
  // The same mock office with era art on: classic is the baseline for the period scenes.
  'floor-eras': { query: 'mock=floor&eras&eraArt=classic' },
  'floor-dotcom': { query: 'mock=floor&eras&eraArt=dotcom' },
  'floor-web2': { query: 'mock=floor&eras&eraArt=web2' },
  'hq-eras': { query: 'mock=hq&eras&eraArt=classic' },
  'hq-dotcom': { query: 'mock=hq&eras&eraArt=dotcom' },
  'hq-web2': { query: 'mock=hq&eras&eraArt=web2' },
  'floor-preinternet': { query: 'mock=floor&eras&eraArt=preinternet', setup: PREINTERNET_PROPS },
  'hq-preinternet': { query: 'mock=hq&eras&eraArt=preinternet', setup: PREINTERNET_PROPS },
};

// Installed before page scripts: sums every rAF callback's work per frame, keyed by the frame's
// timestamp, and counts DOM mutations while recording.
function instrument() {
  const P = { on: false, frames: new Map(), mutations: 0, render: [] };
  window.__perf = P;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const t0 = performance.now();
    try { cb(t); } finally {
      if (P.on) P.frames.set(t, (P.frames.get(t) ?? 0) + performance.now() - t0);
    }
  });
  new MutationObserver((list) => { if (P.on) P.mutations += list.length; })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  // With --phases, every framebuffer switch inside a render drains the GPU (a one pixel read from a scratch
  // target, since gl.finish does not wait on every backend) and charges the time
  // since the last switch to the pass that was bound, so each pass's cost shows up per frame.
  P.phases = new Map();
  if (window.__PHASES) {
    const G = WebGL2RenderingContext.prototype;
    const bind = G.bindFramebuffer, vp = G.viewport, de = G.drawElements, da = G.drawArrays, dei = G.drawElementsInstanced;
    let seg = null, cur = null, scratch = null;
    const drain = (gl) => {
      if (!scratch) {
        const rb = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, 1, 1);
        scratch = gl.createFramebuffer();
        bind.call(gl, gl.FRAMEBUFFER, scratch);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
        scratch.px = new Uint8Array(4);
      }
      bind.call(gl, gl.READ_FRAMEBUFFER, scratch);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, scratch.px);
      bind.call(gl, gl.READ_FRAMEBUFFER, cur);
    };
    const close = (gl) => {
      if (!seg) return;
      drain(gl);
      const key = seg.i + ':' + seg.vp;
      const e = P.phases.get(key) ?? { ms: [], draws: [] };
      e.ms.push(performance.now() - seg.t0); e.draws.push(seg.draws);
      P.phases.set(key, e);
      seg = null;
    };
    P.openSeg = () => { P.n = 0; seg = { i: P.n++, t0: performance.now(), draws: 0, vp: '' }; };
    P.closeSeg = (gl) => { if (P.on && P.inRender) close(gl); seg = null; P.inRender = false; };
    G.bindFramebuffer = function (t, fb) {
      if (P.inRender && P.on) { close(this); seg = { i: P.n++, t0: performance.now(), draws: 0, vp: '' }; }
      cur = fb;
      return bind.call(this, t, fb);
    };
    G.viewport = function (x, y, w, h) { if (seg && !seg.vp) seg.vp = w + 'x' + h; return vp.call(this, x, y, w, h); };
    const cnt = (f) => function (...a) { if (seg) { seg.draws++; if (!seg.vp) { const v = this.getParameter(this.VIEWPORT); seg.vp = v[2] + 'x' + v[3]; } } return f.apply(this, a); };
    G.drawElements = cnt(de); G.drawArrays = cnt(da); G.drawElementsInstanced = cnt(dei);
  }
  P.wrapRender = () => {
    const r = window.__HITL?.controls?.renderer;
    if (!r || r.__perfWrapped) return;
    const orig = r.render.bind(r);
    const gl = document.getElementById('scene').getContext('webgl2');
    const px = new Uint8Array(4);
    r.render = (dt) => {
      const t0 = performance.now();
      if (window.__PHASES) { P.inRender = true; P.openSeg(); }
      orig(dt);
      if (window.__PHASES) P.closeSeg(gl);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (P.on) P.render.push(performance.now() - t0);
    };
    r.__perfWrapped = true;
  };
}

function bundleSizes(dir) {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(join(dir, 'assets'));
  const sum = (re) => files.filter((f) => re.test(f)).reduce((a, f) => {
    const b = readFileSync(f);
    return { raw: a.raw + b.length, gz: a.gz + gzipSync(b).length };
  }, { raw: 0, gz: 0 });
  return { js: sum(/\.js$/), css: sum(/\.css$/) };
}

// A checkout per ref under .vite (sharing this node_modules), or the working tree itself.
function checkout(ref) {
  const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', `${ref}^{commit}`]).toString().trim();
  const dir = join(REF_DIR, sha);
  if (!existsSync(dir)) {
    mkdirSync(REF_DIR, { recursive: true });
    execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', '--quiet', dir, sha]);
    rmSync(join(dir, 'node_modules'), { force: true, recursive: true }); // the post-checkout hook may have linked one already
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  }
  return { label: ref === sha ? sha : `${ref}(${sha})`, root: dir };
}

async function prepare({ label, root }) {
  const outDir = join(root, '.vite/perf-dist');
  execFileSync('nice', ['-n', '10', 'node', join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error', '--outDir', outDir, '--emptyOutDir', ...(PROFILE ? ['--minify', 'false'] : [])], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const server = await preview({ root, configFile: join(root, 'vite.config.js'), logLevel: 'error', build: { outDir }, preview: { port: 0, strictPort: false } });
  const late = SCENES.includes('late') ? await lateSave(root) : null;
  return { label, root, server, base: server.resolvedUrls.local[0], bundle: bundleSizes(outDir), late, scenes: {} };
}

const uncapped = ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'];

async function measure(browser, b, scene, quality) {
  const def = SCENE_DEFS[scene];
  const q = new URLSearchParams(def.query);
  q.set('quality', quality);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (PHASES) await page.addInitScript(() => { window.__PHASES = true; });
  await page.addInitScript(instrument);
  if (def.late) await page.addInitScript((entries) => { for (const [k, v] of entries) localStorage.setItem(k, v); }, b.late.entries);
  const t0 = Date.now();
  await page.goto(`${b.base}?${q}`, { waitUntil: 'load' });
  await waitForBoot(page, { timeout: 120000 });
  const loadMs = Date.now() - t0;
  if (def.late) {
    const res = await page.evaluate(() => window.__HITL.controls.continueGame());
    if (!res?.ok) throw new Error(`late: continueGame failed: ${JSON.stringify(res)}`);
    await page.evaluate(() => window.__HITL.setSpeed(1));
  }
  await page.evaluate(() => window.__perf.wrapRender());
  if (def.setup) await page.evaluate(def.setup);
  if (def.setup === PREINTERNET_PROPS) {
    const got = await page.evaluate(() => window.__perfProps);
    if (!got?.disk_duplicator || !got?.retail_shelf) throw new Error(`could not place the pre-internet props: ${JSON.stringify(got)}`);
  }
  const keep = setInterval(() => { page.evaluate(KEEP_PLAYING).catch(() => {}); }, 1000);
  const cdp = await ctx.newCDPSession(page);
  let profile = null;
  try {
    await page.waitForTimeout(WARMUP * 1000);
    if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    await page.evaluate(() => { window.__perf.on = true; });
    await page.waitForTimeout(SECONDS * 1000);
    await page.evaluate(() => { window.__perf.on = false; });
    if (PROFILE) profile = (await cdp.send('Profiler.stop')).profile;
  } finally {
    clearInterval(keep);
  }
  const raw = await page.evaluate(() => {
    const P = window.__perf;
    const ts = [...P.frames.keys()].sort((a, c) => a - c);
    return {
      ts, cpu: ts.map((t) => P.frames.get(t)), render: P.render, mutations: P.mutations,
      info: window.__HITL.controls.renderer?.perf ?? null,
      phases: [...P.phases].map(([k, e]) => [k, e.ms, e.draws]),
    };
  });
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  await ctx.close();
  if (errors.length) throw new Error(`${b.label} ${scene}/${quality}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  const gaps = raw.ts.slice(1).map((t, i) => t - raw.ts[i]);
  return {
    frames: raw.ts.length, p50: quantile(gaps, 0.5), p95: quantile(gaps, 0.95), cpu: median(raw.cpu), render: median(raw.render),
    calls: raw.info?.calls, triangles: raw.info?.triangles, geometries: raw.info?.geometries, textures: raw.info?.textures,
    programs: raw.info?.programs, meshes: raw.info?.meshes, heapMB: heap.usedSize / 2 ** 20, dom: dom.nodes,
    mutPerSec: raw.mutations / SECONDS, loadMs, profile: profile && selfTimes(profile),
    phases: PHASES ? raw.phases.map(([k, ms, d]) => ({ pass: k, ms: median(ms), draws: median(d), frames: ms.length })) : undefined,
  };
}

// Self time per function from a CPU profile, as { 'name file:line': ms }.
function selfTimes(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const out = {};
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const f = byId.get(profile.samples[i]).callFrame;
    const file = f.url ? f.url.replace(/^.*\/(assets|src|node_modules)\//, '$1/') : '';
    const key = `${f.functionName || '(anon)'} ${file}${file ? `:${f.lineNumber + 1}` : ''}`;
    out[key] = (out[key] ?? 0) + (dts[i + 1] ?? 0) / 1000;
  }
  return out;
}

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const pad = (x, n) => String(x ?? '-').padStart(n);
function formatRow(label, key, r) {
  const k = (x) => (Number.isFinite(x) ? `${Math.round(x / 1000)}k` : '-');
  return `${label.padEnd(12)} ${key.padEnd(11)} p50 ${pad(f1(r.p50), 6)}  p95 ${pad(f1(r.p95), 6)}  cpu ${pad(f1(r.cpu), 5)}  render ${pad(f1(r.render), 6)}  best ${pad(f1(r.best), 6)}`
    + `  calls ${pad(r.calls, 4)}  tris ${pad(k(r.triangles), 5)}  meshes ${pad(r.meshes, 4)}  geo ${pad(r.geometries, 4)}  tex ${pad(r.textures, 3)}`
    + `  prog ${pad(r.programs, 3)}  heap ${pad(f1(r.heapMB), 5)}MB  dom ${pad(r.dom, 5)}  mut/s ${pad(f1(r.mutPerSec), 6)}`;
}

// Ref worktrees go away however the run ends, including timeout's SIGTERM and Ctrl-C.
function removeRefWorktrees() {
  if (!REFS || !existsSync(REF_DIR)) return;
  for (const d of readdirSync(REF_DIR)) {
    try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', join(REF_DIR, d)], { stdio: 'ignore' }); } catch { /* already gone */ }
  }
  rmSync(REF_DIR, { recursive: true, force: true });
  try { execFileSync('git', ['-C', ROOT, 'worktree', 'prune']); } catch { /* nothing to prune */ }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { removeRefWorktrees(); process.exit(130); });

const specs = REFS ? REFS.map(checkout) : [{ label: 'worktree', root: ROOT }];
const builds = [];
for (const s of specs) builds.push(await prepare(s));
let quiet = null;
if (QUIET !== null) {
  try {
    quiet = await takeQuietWindow(QUIET);
  } catch (e) {
    console.error(`perf: ${e.message}`);
    for (const b of builds) await b.server.close();
    removeRefWorktrees();
    process.exit(1);
  }
}
const { browser, renderer: glName } = await launchChromium(chromium, { mode: GL, label: 'perf', args: uncapped, executablePath: browserExecutable() });

const affinity = CPUS ?? 'all';
const kb = (n) => `${Math.round(n / 1024)}KB`;
// Machine load next to every result: timings taken on a busy machine aren't a baseline.
const load = () => loadavg()[0].toFixed(1);
const loadAtStart = load();
console.log(`perf  gl=${GL} size=${W}x${H} runs=${RUNS} warmup=${WARMUP}s seconds=${SECONDS} cpus=${affinity ?? '?'}/${cpus().length} load=${loadAtStart}${quiet ? ` quiet=${QUIET}m` : ''}`);
for (const b of builds) {
  console.log(`build ${b.label.padEnd(12)}${PROFILE ? " (unminified)" : ""} js ${kb(b.bundle.js.raw)} (gz ${kb(b.bundle.js.gz)})  css ${kb(b.bundle.css.raw)} (gz ${kb(b.bundle.css.gz)})`
    + (b.late ? `  late: week ${b.late.week} stage ${b.late.stage} staff ${b.late.staff}${b.late.over ? ' (over)' : ''}` : ''));
}
let exitCode = 0;
try {
  for (const scene of SCENES) {
    for (const quality of QUALITIES) {
      const key = `${scene}/${quality}`;
      const runs = new Map(builds.map((b) => [b, []]));
      const release = await takeRenderLock();
      // Alternate builds run by run (A B B A ...) so drift in machine load hits each build alike.
      try {
        for (let i = 0; i < RUNS; i++) {
          for (const b of i % 2 ? [...builds].reverse() : builds) runs.get(b).push(await measure(browser, b, scene, quality));
        }
      } finally {
        release();
      }
      for (const b of builds) {
        const rs = runs.get(b);
        const keys = Object.keys(rs[0]).filter((k) => typeof rs[0][k] === 'number');
        const med = Object.fromEntries(keys.map((k) => [k, median(rs.map((r) => r[k]))]));
        // The fastest run: other jobs on shared cores only ever add time, so it is the steadiest figure.
        med.best = Math.min(...rs.map((r) => r.render));
        med.load = +load();
        if (quiet?.ended) med.quietEnded = 1;
        b.scenes[key] = { ...med, spread: { p50: rs.map((r) => +r.p50.toFixed(2)), render: rs.map((r) => +r.render.toFixed(2)) } };
        console.log(`${formatRow(b.label, key, med)}  load ${med.load}${med.quietEnded ? '  (after the quiet window)' : ''}`);
        if (PHASES) {
          for (const ph of rs[Math.floor(rs.length / 2)].phases) console.log(`  phase ${ph.pass.padEnd(14)} ${f1(ph.ms).padStart(8)}ms  draws ${String(ph.draws).padStart(4)}`);
        }
        if (PROFILE) {
          const total = {};
          for (const r of rs) for (const [k, ms] of Object.entries(r.profile)) total[k] = (total[k] ?? 0) + ms / rs.length;
          const all = Object.values(total).reduce((a, x) => a + x, 0);
          for (const [k, ms] of Object.entries(total).sort((a, c) => c[1] - a[1]).slice(0, 15)) {
            console.log(`  prof ${(ms / SECONDS).toFixed(1).padStart(6)}ms/s ${((100 * ms) / all).toFixed(1).padStart(5)}%  ${k}`);
          }
        }
      }
    }
  }
} catch (e) {
  console.error(`perf: ${e.message}`);
  exitCode = 1;
} finally {
  await browser.close();
  await quiet?.release();
  for (const b of builds) await b.server.close();
  removeRefWorktrees();
}
const jsonOut = arg('json', null);
if (typeof jsonOut === 'string') {
  const out = {
    gl: GL, glName, size: `${W}x${H}`, runs: RUNS, warmup: WARMUP, seconds: SECONDS, cpus: affinity, hostCpus: cpus().length, loadAtStart: +loadAtStart, quiet: QUIET,
    builds: builds.map((b) => ({ label: b.label, bundle: b.bundle, late: b.late && { week: b.late.week, stage: b.late.stage, staff: b.late.staff }, scenes: b.scenes })),
  };
  mkdirSync(resolve(jsonOut, '..'), { recursive: true });
  writeFileSync(jsonOut, `${JSON.stringify(out, null, 2)}\n`);
}
process.exit(exitCode);
