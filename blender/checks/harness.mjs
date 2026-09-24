// Deterministic page setup shared by the headless checks (golden.mjs, clip.mjs).
//
// The page runs with Math.random seeded, the clock frozen, and requestAnimationFrame held from the
// first frame, so the game's own loop never runs. openScene() waits for real readiness (renderer
// handles, models, fonts), never for wall time; the caller then steps frames itself with
// window.__step(n), which advances the clock by 1/30 s per frame. A run depends only on the code.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const INIT = `(() => {
  let s = 1234567;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let t = 0;
  performance.now = () => t;
  Date.now = () => 1700000000000 + t;
  window.__tick = (ms) => { t += ms; };
  window.requestAnimationFrame = () => 0;
})();`;

export async function startHarness() {
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  return {
    browser,
    // A page on `query`, ready to step. errors collects page errors and console errors.
    async openScene(query, { width = 960, height = 640, time = 0.45 } = {}) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
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
    async close() { await browser.close(); await server.close(); },
  };
}
