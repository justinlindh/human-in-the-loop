// Golden images: a fixed set of close-up renders compared against stored references.
//
//   node blender/checks/golden.mjs            compare; exits 1 if any scene differs
//   node blender/checks/golden.mjs --update   rewrite the references (commit them deliberately)
//
// Each scene loads the game with Math.random seeded and the clock frozen, then steps a fixed
// number of frames by hand, so a render depends only on the code. Differences are counted per
// pixel (any channel off by more than CHANNEL_TOL); a scene fails when more than MAX_SHARE of
// pixels differ. Failures write <scene>.actual.png and <scene>.diff.png next to the reference.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, 'golden');
const OUT = resolve(HERE, '..', '..', 'shots', 'golden');
const UPDATE = process.argv.includes('--update');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const CHANNEL_TOL = 24;
const MAX_SHARE = 0.004;
const W = 960, H = 640;

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
];

// Runs before any page script: a seeded Math.random, a clock that only moves when stepped, and
// requestAnimationFrame held so the game's own loop never runs after start-up.
const INIT = `(() => {
  let s = 1234567;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let t = 0;
  performance.now = () => t;
  Date.now = () => 1700000000000 + t;
  window.__tick = (ms) => { t += ms; };
  const raf = window.requestAnimationFrame.bind(window);
  let hold = false;
  window.__holdFrames = () => { hold = true; };
  window.requestAnimationFrame = (cb) => raf((ts) => { if (!hold) { t += 16; cb(t); } });
})();`;

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
mkdirSync(REF, { recursive: true });
mkdirSync(OUT, { recursive: true });

let failed = 0;
const results = [];
for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.name)) continue;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(INIT);
  await page.goto(`${base}?snap=1&quality=medium&time=day&${sc.query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 120000 });
  await page.waitForTimeout(1500);           // models and fonts finish loading (the clock is frozen)
  const png = await page.evaluate(async ({ setup, steps, zoom }) => {
    window.__holdFrames();
    const R = window.__hitlRender;
    const S = window.__HITL?.state;
    window.__focus = null; window.__nap = null;
    R.setSpeed?.(1);                         // snaps start at speed 0 and paused, which freezes poses
    R.setPaused?.(false);
    if (setup) (0, eval)(setup);
    const step = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(S); R.render(1 / 30); } };
    step(10);
    if (window.__nap) {
      const who = S.staff[0].id;
      R.perks.send([who], window.__nap, { dur: 600, nap: true });
      for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) R.advance(0.1);
      const e = R.office.placed.get(window.__nap);
      R.focusAt(e.target.x, e.target.z, zoom);
    } else if (window.__focus !== null && R.office?.current) {
      const d = R.office.current.desks[window.__focus];
      R.focusAt(d.seat.x, d.seat.z, zoom);
    }
    step(steps);
    const c = document.querySelector('canvas');
    return c.toDataURL('image/png');
  }, { setup: sc.setup ?? '', steps: sc.steps, zoom: sc.zoom ?? 1 });
  const buf = Buffer.from(png.split(',')[1], 'base64');
  const refPath = join(REF, `${sc.name}.png`);
  if (UPDATE || !existsSync(refPath)) {
    writeFileSync(refPath, buf);
    results.push(`${sc.name}: reference ${UPDATE ? 'updated' : 'created'}`);
    await page.close();
    continue;
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
  if (!ok) {
    failed++;
    writeFileSync(join(OUT, `${sc.name}.actual.png`), buf);
    if (cmp.diff) writeFileSync(join(OUT, `${sc.name}.diff.png`), Buffer.from(cmp.diff.split(',')[1], 'base64'));
  }
  results.push(`${sc.name}: ${ok ? 'ok' : 'DIFFERS'} ${(cmp.share * 100).toFixed(3)}% of pixels${errors.length ? `, page errors: ${errors.join('; ')}` : ''}`);
  await page.close();
}
await browser.close();
await server.close();
for (const r of results) console.log(`GOLDEN ${r}`);
if (failed) console.log(`golden: ${failed} scene(s) differ; see shots/golden/*.diff.png, or run with --update if the change is intended`);
process.exit(failed ? 1 : 0);
