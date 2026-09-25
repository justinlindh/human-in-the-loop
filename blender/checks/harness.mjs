// Deterministic page setup shared by the headless checks (golden.mjs, clip.mjs).
//
// The page runs with Math.random seeded, the clock frozen, and requestAnimationFrame held from the
// first frame, so the game's own loop never runs. openScene() waits for real readiness (renderer
// handles, models, fonts), never for wall time; the caller then steps frames itself with
// window.__step(n), which advances the clock by 1/30 s per frame (or window.__advance(n), the same
// without drawing). Tool code that makes three.js objects mid-run goes inside window.__tool(fn) (see
// INIT). A run depends only on the code.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';

// Two seeded streams. The game draws from Math.random, and so does three.js: it takes a UUID from
// Math.random for every object, geometry, material or texture it makes (clone() and new
// WebGLRenderer included). A tool that makes any of those mid-run (a crop, a probe, an overlay)
// would shift the game's stream and change every state after it, so tool code runs inside
// window.__tool(fn), which gives fn a stream of its own. fn must be synchronous.
const INIT = `(() => {
  let s = 1234567;
  const game = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let ts = 7654321;
  const tool = () => { ts = (ts * 16807) % 2147483647; return (ts - 1) / 2147483646; };
  Math.random = game;
  window.__tool = (fn) => {
    const prev = Math.random;
    Math.random = tool;
    try { return fn(); } finally { Math.random = prev; }
  };
  let t = 0;
  performance.now = () => t;
  Date.now = () => 1700000000000 + t;
  window.__tick = (ms) => { t += ms; };
  window.requestAnimationFrame = () => 0;
})();`;

// Checks render on the GPU unless told otherwise (scripts/lib/gl.js: --software or HITL_GL=software).
// Pixel comparisons (golden) pass gpu: false, since only SwiftShader draws the same pixels on every
// machine. A GPU run that cannot get a hardware renderer fails rather than falling back.

// True unless the command line or HITL_GL asks for software GL (or HITL_GPU=0).
export function wantGpu(argv = process.argv) {
  if (process.env.HITL_GPU === '1') return true;
  if (process.env.HITL_GPU === '0') return false;
  return glMode({ argv }) === 'gpu';
}

async function launch(gpu) {
  const { browser, renderer } = await launchChromium(chromium, { mode: gpu ? 'gpu' : 'software', label: 'harness' });
  return { browser, renderer };
}

// gpu: render on the GPU (the default, see wantGpu) or on SwiftShader.
// browsers: separate Chromium instances to spread pages over. Every page in one browser shares its
// GPU process, so SwiftShader work from concurrent pages queues behind each other; checks that run
// scenes in parallel pass their job count here. openScene's `slot` picks the browser.
export async function startHarness({ gpu = wantGpu(), browsers = 1 } = {}) {
  // Every check renders under the render lock for its mode: a GPU slot, or the software lock.
  holdRenderLock(gpu ? 'gpu' : 'software');
  // HITL_VITE_CACHE gives the server its own dependency cache, so checks running side by side never
  // re-optimize (and reload) each other's dependencies.
  const cacheDir = process.env.HITL_VITE_CACHE || undefined;
  const server = await createServer({ ...(cacheDir ? { cacheDir } : {}), server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const launched = await Promise.all(Array.from({ length: Math.max(1, browsers) }, () => launch(gpu)));
  const { browser, renderer } = launched[0];
  return {
    browser,
    renderer,
    // A page on `query`, ready to step. errors collects page errors and console errors.
    async openScene(query, { width = 960, height = 640, time = 0.45, slot = 0 } = {}) {
      const page = await launched[slot % launched.length].browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript(INIT);
      await page.goto(`${base}?snap=1&${query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__HITL && window.__hitlRender?.ready, null, { timeout: 120000, polling: 50 });
      await page.evaluate(async (tod) => {
        await document.fonts.load('700 16px Fredoka');
        await document.fonts.ready;
        const R = window.__hitlRender, S = window.__HITL.state;
        R.setSpeed?.(1);
        R.setPaused?.(false);
        R.setTimeOfDay?.(tod);
        window.__step = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(S); R.render(1 / 30); } };
        // Stepping without drawing. R.advance() moves people, moments and effects but, unlike render(),
        // never refreshes world matrices; game logic reads them (paths, gaze, props that follow a desk),
        // so a stepper that skipped the refresh would play differently from the game, and any tool that
        // later refreshed them (a crop, a probe) would change what comes after.
        window.__advance = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
      }, time);
      return { page, errors };
    },
    async close() { await Promise.all(launched.map((l) => l.browser.close())); await server.close(); },
  };
}
