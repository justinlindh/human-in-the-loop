// Deterministic video and screenshot capture. Every frame advances the page by exactly 1/fps of
// virtual time (clock, timers, requestAnimationFrame, CSS animations, and a seeded Math.random all
// follow it), so clips are smooth and repeatable however slowly the machine renders.
//
// npm run capture -- --only waffle-party            one item from the manifest
// npm run capture -- --group readme                  the README stills and loop
// npm run capture -- --manifest scripts/capture-manifest.js --out shots/capture
//   [--url http://localhost:5174] [--fps 60] [--size 1920x1080] [--quality high] [--software]
//   [--gif] [--no-webm] [--webm-size 1280x720 --webm-bitrate 1.4M] [--build <sha>] [--seconds N] [--list]
// Without --url it serves the working tree itself. Output: <out>/<id>.mp4 (H.264, yuv420p, CRF 18),
// <id>.webm (VP9, CRF 30),
// optional <id>.gif, screenshots <id>-<t>s.png, and index.json describing every file.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs';
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
// --audio records the game's sound into each clip (AAC in the MP4, Opus in the WebM).
const AUDIO = !!args.audio;
const OUT = resolve(String(args.out ?? 'shots/capture').replace(/^~/, homedir()));
const manifestPath = resolve(String(args.manifest ?? 'scripts/capture-manifest.js'));
const { ITEMS } = await import(pathToFileURL(manifestPath).href);

if (args.list) {
  for (const it of ITEMS) console.log(`${it.id.padEnd(22)} ${(it.still ? "still" : `${it.seconds}s`).padStart(5)}  ${it.group ? `[${it.group}] ` : ""}${it.title}`);
  process.exit(0);
}
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
// --group readme picks items tagged with that group; untagged items are the review set.
const group = typeof args.group === 'string' ? args.group : null;
const items = ITEMS.filter((it) => (only ? only.has(it.id) : group ? it.group === group : !it.group));
if (!items.length) { console.error(`capture: nothing matches --only ${args.only}`); process.exit(1); }

// Installed before any page script runs. Time only moves when the capture script says so.
function shim({ fps, seed, audioSeconds }) {
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
  // Sound on the virtual clock: the page's AudioContext is an offline one whose currentTime follows
  // virtual time, so everything scheduled lands where its frames are; it is rendered after the clip.
  let audioCtx = null;
  let audioT0 = 0;
  if (audioSeconds && window.OfflineAudioContext) {
    const RATE = 48000;
    class CaptureAudioContext extends window.OfflineAudioContext {
      constructor() {
        super(2, Math.ceil(RATE * audioSeconds), RATE);
        audioCtx = this;
        audioT0 = now;
      }
      get currentTime() { return (now - audioT0) / 1000; }
      get state() { return 'running'; }
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    window.AudioContext = CaptureAudioContext;
    window.webkitAudioContext = CaptureAudioContext;
  }
  window.__capture = {
    // Renders the page's sound and returns [fromMs, fromMs + ms) of virtual time as a 16-bit stereo
    // WAV in base64, with its peak and RMS; null when the page never made an AudioContext.
    async audio(fromMs, ms) {
      if (!audioCtx) return null;
      const buf = await audioCtx.startRendering();
      const rate = buf.sampleRate;
      const start = Math.max(0, Math.round(((fromMs - audioT0) / 1000) * rate));
      const n = Math.max(0, Math.min(buf.length - start, Math.round((ms / 1000) * rate)));
      const ch = [buf.getChannelData(0), buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0)];
      const bytes = new Uint8Array(44 + n * 4);
      const v = new DataView(bytes.buffer);
      const str = (o, t) => { for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
      v.setUint16(22, 2, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
      str(36, 'data'); v.setUint32(40, n * 4, true);
      let peak = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 2; c++) {
          const x = Math.max(-1, Math.min(1, ch[c][start + i]));
          peak = Math.max(peak, Math.abs(x)); sum += x * x;
          v.setInt16(44 + (i * 2 + c) * 2, x * 32767, true);
        }
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { wav: btoa(bin), peak, rms: Math.sqrt(sum / Math.max(1, n * 2)) };
    },
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

// VP9 WebM alongside every MP4: some desktop players will not open the H.264 file. With
// --webm-size and --webm-bitrate (for a web page) it is scaled and bitrate-capped instead of CRF.
const WEBM_SIZE = typeof args['webm-size'] === 'string' ? args['webm-size'].split('x').map(Number) : null;
const WEBM_RATE = typeof args['webm-bitrate'] === 'string' ? args['webm-bitrate'] : null;
function webm(mp4, file) {
  const scale = WEBM_SIZE ? ['-vf', `scale=${WEBM_SIZE[0]}:${WEBM_SIZE[1]}:flags=lanczos`] : [];
  const run = (argv) => new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, ...scale, '-c:v', 'libvpx-vp9', '-row-mt', '1', '-pix_fmt', 'yuv420p', ...argv], { stdio: 'inherit' });
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`webm ffmpeg exited ${code}`))));
  });
  if (!WEBM_RATE) return run(['-crf', '30', '-b:v', '0', '-c:a', 'libopus', '-b:a', '96k', file]);
  // Two-pass VBR hits the bitrate (and so the file size) far more closely than one pass.
  const log = `${file}.pass`;
  return run(['-b:v', WEBM_RATE, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '/dev/null'])
    .then(() => run(['-b:v', WEBM_RATE, '-pass', '2', '-passlogfile', log, '-deadline', 'good', '-cpu-used', '2', '-c:a', 'libopus', '-b:a', '96k', file]))
    .finally(() => rmSync(`${log}-0.log`, { force: true }));
}

// Replaces the MP4 with one that carries the WAV as AAC, video stream copied.
function muxAudio(mp4, wav) {
  const tmp = `${mp4}.tmp.mp4`;
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', tmp], { stdio: 'inherit' });
    p.on('close', (code) => { if (code !== 0) return fail(new Error(`mux ffmpeg exited ${code}`)); renameSync(tmp, mp4); ok(); });
  });
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
// The build captured: the served tree's commit when capture serves it, else --build, else unknown.
const BUILD = typeof args.build === 'string' ? args.build
  : typeof args.url === 'string' ? 'unknown'
  : (() => { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
index.build = BUILD;
const browser = await chromium.launch({ args: gl });
let failed = false;

try {
  for (const it of items) {
    const t0 = Date.now();
    // A still item records only until its last screenshot and writes no video.
    const seconds = it.still ? Math.max(...(it.screenshots ?? [1])) + 1 / FPS : Number(args.seconds ?? it.seconds);
    const frames = Math.round(seconds * FPS);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // Enough offline audio for boot, warmup, and the clip.
    const audioSeconds = AUDIO && !it.still ? 30 + (it.warmup ?? 1) + seconds : 0;
    await ctx.addInitScript(shim, { fps: FPS, seed: it.seed ?? 1, audioSeconds });
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
    if (audioSeconds) await page.evaluate(() => dispatchEvent(new Event('pointerdown')));   // the engine starts sound on a first input
    if (it.setup) await page.evaluate(it.setup);
    for (let i = 0; i < Math.round((it.warmup ?? 1) * FPS); i++) await page.evaluate(() => window.__capture.frame());

    const mp4 = join(OUT, `${it.id}.mp4`);
    const enc = it.still ? { write: async () => {}, end: async () => {} } : ffmpeg(mp4);
    const actions = [...(it.actions ?? [])].sort((a, b) => a.at - b.at);
    const shots = new Set((it.screenshots ?? []).map((s) => Math.round(s * FPS)));
    const pngs = [];
    const recFrom = await page.evaluate(() => window.__capture.now);
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      while (actions.length && actions[0].at <= t) await page.evaluate(actions.shift().js);
      await page.evaluate(() => window.__capture.frame());
      if (!it.still) await enc.write(await page.screenshot({ type: 'jpeg', quality: 95 }));
      if (shots.has(f)) {
        const png = join(OUT, `${it.id}-${t.toFixed(1)}s.png`);
        await page.screenshot({ path: png });
        pngs.push(png);
      }
      if (f % (FPS * 2) === 0) process.stdout.write(`\r${it.id}: ${t.toFixed(0)}/${seconds}s`);
    }
    await enc.end();
    let audio = null;
    if (audioSeconds) {
      const a = await page.evaluate(({ from, ms }) => window.__capture.audio(from, ms), { from: recFrom, ms: (frames / FPS) * 1000 });
      if (a) {
        const wav = join(OUT, `${it.id}.wav`);
        writeFileSync(wav, Buffer.from(a.wav, 'base64'));
        await muxAudio(mp4, wav);
        rmSync(wav);
        audio = { peak: Math.round(a.peak * 1000) / 1000, rms: Math.round(a.rms * 10000) / 10000 };
      }
    }
    const webmFile = join(OUT, `${it.id}.webm`);
    if (!it.still && !args['no-webm']) await webm(mp4, webmFile);
    let gifFile = null;
    if (!it.still && (args.gif || it.gif)) { gifFile = join(OUT, `${it.id}.gif`); await gif(mp4, gifFile); }
    const took = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`\r${errors.length ? 'FAIL' : 'ok  '} ${it.id}: ${it.still ? `${pngs.length} still(s)` : mp4} (${seconds}s at ${FPS} fps, ${W}x${H}, ${QUALITY}; rendered in ${took}s on ${renderer})`);
    for (const e of errors.slice(0, 5)) console.log(`     ${e}`);
    failed ||= errors.length > 0;
    index.items[it.id] = {
      title: it.title, file: it.still ? null : `${it.id}.mp4`, webm: it.still || args['no-webm'] ? null : `${it.id}.webm`, gif: gifFile ? `${it.id}.gif` : null, screenshots: pngs.map((p) => p.slice(OUT.length + 1)),
      seconds, fps: FPS, size: `${W}x${H}`, quality: QUALITY, query: it.query, build: BUILD, renderer, audio, errors: errors.length, capturedAt: new Date().toISOString(),
    };
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await close();
}
process.exit(failed ? 1 : 0);
