// Deterministic page setup shared by the headless checks (golden.mjs, clip.mjs).
//
// The page runs with Math.random seeded, the clock frozen, and requestAnimationFrame held from the
// first frame, so the game's own loop never runs. openScene() waits for real readiness (renderer
// handles, models, fonts), never for wall time; the caller then steps frames itself with
// window.__step(n), which advances the clock by 1/30 s per frame. A run depends only on the code.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, launchChromium } from '../../scripts/lib/gl.js';

const INIT = `(() => {
  let s = 1234567;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
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
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
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
      }, time);
      return { page, errors };
    },
    async close() { await Promise.all(launched.map((l) => l.browser.close())); await server.close(); },
  };
}
