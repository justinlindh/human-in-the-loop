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

// SwiftShader draws the same pixels on every machine, which the golden and clip checks need. Renders
// that only have to look right (the logo build, clips) can opt into the GPU instead.
const SOFTWARE_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GPU_GL = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];

// True when a render script was asked for the GPU: HITL_GPU=1 or --gpu. Checks never call this.
export function wantGpu(argv = process.argv) {
  return process.env.HITL_GPU === '1' || argv.includes('--gpu');
}

async function launch(gpu) {
  if (gpu) {
    const browser = await chromium.launch({ args: GPU_GL });
    const renderer = await rendererOf(browser);
    if (renderer && !/SwiftShader/i.test(renderer)) return { browser, renderer };
    await browser.close();
    console.warn(`harness: no GPU (${renderer ?? 'no WebGL2'}), using SwiftShader`);
  }
  const browser = await chromium.launch({ args: SOFTWARE_GL });
  return { browser, renderer: 'SwiftShader' };
}

async function rendererOf(browser) {
  const page = await browser.newPage();
  const r = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown') : null;
  });
  await page.close();
  return r;
}

// gpu: render on the GPU when there is one (see wantGpu); the default is SwiftShader.
export async function startHarness({ gpu = false } = {}) {
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const { browser, renderer } = await launch(gpu);
  return {
    browser,
    renderer,
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
