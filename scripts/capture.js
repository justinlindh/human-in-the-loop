// Deterministic video and screenshot capture. Every frame advances the page by exactly 1/fps of
// virtual time (clock, timers, requestAnimationFrame, CSS animations, and a seeded Math.random all
// follow it), so clips are smooth and repeatable however slowly the machine renders.
//
// npm run capture -- --only waffle-party            one item from the manifest
// npm run capture -- --manifest scripts/capture-manifest.js --out ~/src/gamedev-reel/review-2026-09-24
//   [--url http://localhost:5174] [--fps 60] [--size 1920x1080] [--quality high] [--software]
//   [--gif] [--seconds N] [--list]
// Without --url it serves the working tree itself. Output: <out>/<id>.mp4 (H.264, yuv420p, CRF 18),
// optional <id>.gif, screenshots <id>-<t>s.png, and index.json describing every file.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const FPS = Number(args.fps ?? 60);
const [W, H] = String(args.size ?? '1920x1080').split('x').map(Number);
const QUALITY = args.quality ?? 'high';
const OUT = resolve(String(args.out ?? join(homedir(), 'src/gamedev-reel')).replace(/^~/, homedir()));
const manifestPath = resolve(String(args.manifest ?? 'scripts/capture-manifest.js'));
const { ITEMS } = await import(pathToFileURL(manifestPath).href);

if (args.list) {
  for (const it of ITEMS) console.log(`${it.id.padEnd(22)} ${String(it.seconds).padStart(4)}s  ${it.title}`);
  process.exit(0);
}
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const items = ITEMS.filter((it) => !only || only.has(it.id));
if (!items.length) { console.error(`capture: nothing matches --only ${args.only}`); process.exit(1); }

// Installed before any page script runs. Time only moves when the capture script says so.
function shim({ fps, seed }) {
  let now = 0;
  const epoch = Date.parse('2026-01-01T09:00:00Z');
  const timers = new Map();
  let seq = 1;
  let rafs = [];
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = seq++; const every = Math.max(1, Number(ms) || 0); timers.set(id, { at: now + every, fn, a, every }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = seq++; rafs.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r.id !== id); };
  const run = (fn, a) => { try { if (typeof fn === 'function') fn(...a); } catch (e) { console.error(e); } };
  window.__capture = {
    fps,
    get now() { return now; },
    // One frame: fire due timers in time order, run this frame's rAF callbacks, step CSS animations.
    frame() {
      const ms = 1000 / fps;
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.t.at)) next = { id, t };
        if (!next) break;
        now = Math.max(now, next.t.at);
        if (next.t.every) next.t.at += next.t.every; else timers.delete(next.id);
        run(next.t.fn, next.t.a);
      }
      now = end;
      const list = rafs;
      rafs = [];
      for (const r of list) run(r.cb, [now]);
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (Number(a.currentTime) || 0) + ms;
      }
    },
  };
}

async function serve() {
  if (typeof args.url === 'string') return { base: args.url.replace(/\/?$/, '/'), close: async () => {} };
  const { createServer } = await import('vite');
  const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  return { base: server.resolvedUrls.local[0], close: () => server.close() };
}

const gl = args.software
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];

function ffmpeg(file) {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    // Screenshots are full-range JPEG; convert to the limited-range yuv420p every player expects.
    '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));
  return { write: (buf) => new Promise((ok) => (p.stdin.write(buf) ? ok() : p.stdin.once('drain', ok))), end: async () => { p.stdin.end(); await done; } };
}

function gif(mp4, file) {
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', file], { stdio: 'inherit' });
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`gif ffmpeg exited ${code}`))));
  });
}

mkdirSync(OUT, { recursive: true });
const indexFile = join(OUT, 'index.json');
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : { items: {} };
const { base, close } = await serve();
const browser = await chromium.launch({ args: gl });
let failed = false;

try {
  for (const it of items) {
    const t0 = Date.now();
    const seconds = Number(args.seconds ?? it.seconds);
    const frames = Math.round(seconds * FPS);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(shim, { fps: FPS, seed: it.seed ?? 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
    const query = new URLSearchParams(it.query ?? '');
    query.set('quality', QUALITY);
    await page.goto(`${base}?${query}`, { waitUntil: 'domcontentloaded' });
    // Boot: frames only advance on request, so step until the game has drawn its first frame.
    // A dev server may reload the page once while it optimizes dependencies; keep stepping through it.
    const bootStep = () => page.evaluate(() => { window.__capture?.frame(); return window.__HITL_READY === true; }).catch(() => false);
    for (let i = 0; i < 3000 && !(await bootStep()); i++) await new Promise((r) => setTimeout(r, 10));
    const renderer = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('webgl2');
      const ext = c?.getExtension('WEBGL_debug_renderer_info');
      return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    if (it.hideUi) await page.addStyleTag({ content: '#ui { display: none !important; }' });
    if (it.setup) await page.evaluate(it.setup);
    for (let i = 0; i < Math.round((it.warmup ?? 1) * FPS); i++) await page.evaluate(() => window.__capture.frame());

    const mp4 = join(OUT, `${it.id}.mp4`);
    const enc = ffmpeg(mp4);
    const actions = [...(it.actions ?? [])].sort((a, b) => a.at - b.at);
    const shots = new Set((it.screenshots ?? []).map((s) => Math.round(s * FPS)));
    const pngs = [];
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      while (actions.length && actions[0].at <= t) await page.evaluate(actions.shift().js);
      await page.evaluate(() => window.__capture.frame());
      const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
      await enc.write(jpg);
      if (shots.has(f)) {
        const png = join(OUT, `${it.id}-${t.toFixed(1)}s.png`);
        await page.screenshot({ path: png });
        pngs.push(png);
      }
      if (f % (FPS * 2) === 0) process.stdout.write(`\r${it.id}: ${t.toFixed(0)}/${seconds}s`);
    }
    await enc.end();
    let gifFile = null;
    if (args.gif || it.gif) { gifFile = join(OUT, `${it.id}.gif`); await gif(mp4, gifFile); }
    const took = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`\r${errors.length ? 'FAIL' : 'ok  '} ${it.id}: ${mp4} (${seconds}s at ${FPS} fps, ${W}x${H}, ${QUALITY}; rendered in ${took}s on ${renderer})`);
    for (const e of errors.slice(0, 5)) console.log(`     ${e}`);
    failed ||= errors.length > 0;
    index.items[it.id] = {
      title: it.title, file: `${it.id}.mp4`, gif: gifFile ? `${it.id}.gif` : null, screenshots: pngs.map((p) => p.slice(OUT.length + 1)),
      seconds, fps: FPS, size: `${W}x${H}`, quality: QUALITY, query: it.query, url: base, renderer, errors: errors.length, capturedAt: new Date().toISOString(),
    };
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await close();
}
process.exit(failed ? 1 : 0);
