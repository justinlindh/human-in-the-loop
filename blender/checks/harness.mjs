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
import { installDrawAudit } from './draw-audit.js';
import { paramPlugin } from './param.js';

// Two seeded streams. The game draws from Math.random, and so does three.js: it takes a UUID from
// Math.random for every object, geometry, material or texture it makes (clone() and new
// WebGLRenderer included). A tool that makes any of those mid-run (a crop, a probe, an overlay)
// would shift the game's stream and change every state after it, so tool code runs inside
// window.__tool(fn), which gives fn a stream of its own. fn must be synchronous.
const INIT = `(() => {
  const SEED = 1234567;
  // Until __reseedGame the page draws from a load stream with its own seed, so the UUIDs three.js
  // gives loaded materials and geometries never repeat in the game stream that starts after it.
  let s = 2468013;
  const game = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let ts = 7654321;
  const tool = () => { ts = (ts * 16807) % 2147483647; return (ts - 1) / 2147483646; };
  Math.random = game;
  window.__tool = (fn) => {
    const prev = Math.random;
    Math.random = tool;
    try { return fn(); } finally { Math.random = prev; }
  };
  // Loading a model draws from the game stream too (three.js takes a UUID from Math.random for
  // every geometry, material and texture it makes), so an asset's own contents shift every draw
  // after it loads. openScene switches to the game stream once the page is ready, before a check's
  // own setup runs, so what a scene stages depends only on the check's code, never on what happened
  // to load.
  window.__reseedGame = () => { s = SEED; };
  let t = 0;
  performance.now = () => t;
  Date.now = () => 1700000000000 + t;
  window.__tick = (ms) => { t += ms; };
  // Frames never run on their own; callbacks queue here for a check that drives the game loop itself.
  window.__rafQ = [];
  window.requestAnimationFrame = (cb) => { window.__rafQ.push(cb); return window.__rafQ.length; };
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

// A named-phase stopwatch: mark('x') records ms since the last mark (or since the timer started)
// under phases.x. Cheap (a handful of performance.now() calls); always on, so --profile callers and
// a warm server deciding what a reload actually cost can see where cold-start time goes.
function phaseTimer() {
  const phases = {}; let last = performance.now();
  return { phases, mark(name) { const now = performance.now(); phases[name] = now - last; last = now; } };
}

// gpu: render on the GPU (the default, see wantGpu) or on SwiftShader.
// params: resolved --param overrides (param.js) applied to game modules as the page loads them.
// browsers: separate Chromium instances to spread pages over. Every page in one browser shares its
// GPU process, so SwiftShader work from concurrent pages queues behind each other; checks that run
// scenes in parallel pass their job count here. openScene's `slot` picks the browser.
export async function startHarness({ gpu = wantGpu(), browsers = 1, auditDraws = false, params = [] } = {}) {
  const timer = phaseTimer();
  // Every check renders under the render lock for its mode: a GPU slot, or the software lock.
  holdRenderLock(gpu ? 'gpu' : 'software');
  timer.mark('lock');
  // HITL_VITE_CACHE gives the server its own dependency cache, so checks running side by side never
  // re-optimize (and reload) each other's dependencies.
  const cacheDir = process.env.HITL_VITE_CACHE || undefined;
  // three-mesh-bvh is bundled when the server starts: found later, on a tool's first import, it would
  // make Vite rebundle dependencies and reload the page mid-run.
  const server = await createServer({ ...(cacheDir ? { cacheDir } : {}), plugins: params.length ? [paramPlugin(params)] : [], server: { port: 0, strictPort: false }, optimizeDeps: { include: ['three-mesh-bvh'] }, logLevel: 'error' });
  timer.mark('createServer');
  await server.listen();
  timer.mark('listen');
  const base = server.resolvedUrls.local[0];
  const launched = await Promise.all(Array.from({ length: Math.max(1, browsers) }, () => launch(gpu)));
  timer.mark('launchChromium');
  const { browser, renderer } = launched[0];
  // Every path any page of this harness requested (cache.mjs's requestedFiles turns them into files).
  const allRequests = new Set();
  return {
    browser,
    renderer,
    requested: () => [...allRequests],
    // Cold-start cost outside any one scene: the render lock, the Vite server and the browser
    // launch. Fixed per startHarness() call, before any page opens.
    phases: timer.phases,
    // A page on `query`, ready to step. errors collects page errors and console errors.
    async openScene(query, { width = 960, height = 640, time = 0.45, slot = 0 } = {}) {
      const pt = phaseTimer();
      const page = await launched[slot % launched.length].browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      pt.mark('newPage');
      const errors = [];
      // Every path the page requests, so a check can key a cache on exactly what the scene loaded.
      const requests = new Set();
      page.on('request', (r) => { requests.add(r.url()); allRequests.add(r.url()); });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      // Pages never touch the network: a request off the harness's own server is aborted, recorded as
      // a page error, and fails opening the page, so no result depends on what the network returned.
      const blocked = [];
      const origin = new URL(base).origin;
      await page.route((url) => url.origin !== origin && /^(https?|wss?):$/.test(url.protocol), (route) => {
        const u = route.request().url();
        blocked.push(u); errors.push(`harness: blocked a network request off the harness server: ${u}`);
        return route.abort('blockedbyclient');
      });
      await page.addInitScript(`${auditDraws ? `(${installDrawAudit.toString()})();` : ''}${INIT}`);
      pt.mark('initScript');
      await page.goto(`${base}?snap=1&${query}`, { waitUntil: 'load' });
      pt.mark('goto');
      await page.waitForFunction(() => window.__HITL && window.__hitlRender?.ready, null, { timeout: 120000, polling: 50 });
      pt.mark('waitReady');
      if (blocked.length) throw new Error(`harness: the page requested the network (blocked): ${blocked.slice(0, 3).join(', ')}`);
      // Reset the game stream now, once model loading and the page's own bootstrap draws are behind
      // it, so nothing a check does afterward can depend on what those drew.
      await page.evaluate(() => window.__reseedGame());
      pt.mark('reseed');
      await page.evaluate(async () => { await document.fonts.load('700 16px Fredoka'); await document.fonts.ready; });
      pt.mark('fonts');
      await page.evaluate(async (tod) => {
        const R = window.__hitlRender, S = window.__HITL.state;
        R.setSpeed?.(1);
        R.setPaused?.(false);
        R.setTimeOfDay?.(tod);
        // The state is read on each frame: a loaded save (continueGame) replaces it.
        window.__step = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(window.__HITL.state); R.render(1 / 30); } };
        // Full frame updates, including camera, DOM projection/layout and world matrices. There is
        // no final draw; unlike __advance this follows render's complete update path. Seeded parity
        // with __step requires the caller to initialize draw resources via __settle first.
        window.__sample = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(window.__HITL.state); R.render(1 / 30, { draw: false }); } };
        // The same n frames, drawing only the last: every update still runs each frame, so the final
        // picture is identical to __step(n), without paying for the frames nobody looks at.
        window.__settle = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(window.__HITL.state); R.render(1 / 30, { draw: i === n - 1 }); } };
        // Raycasts through a bounding-volume tree (blender/checks/bvh.js patchRaycast) instead of
        // testing every triangle, for checks that probe the scene each frame. Loading the module makes
        // three.js objects, which take UUIDs from Math.random, so it loads on the tool stream.
        // { install: false } loads the module without patching raycast (a comparison run).
        window.__fastRaycast = async ({ install = true } = {}) => {
          if (window.__fastRaycastOn) return;
          const THREE = R.THREE;
          const toolRandom = window.__tool(() => Math.random), gameRandom = Math.random;
          Math.random = toolRandom;
          let bvh;
          try { bvh = await import('/blender/checks/bvh.js'); } finally { Math.random = gameRandom; }
          if (!install) return;
          bvh.patchRaycast(THREE, window.__tool);
          window.__fastRaycastOn = true;
        };
        // Stepping without drawing. R.advance() moves people, moments and effects but, unlike render(),
        // never refreshes world matrices; game logic reads them (paths, gaze, props that follow a desk),
        // so a stepper that skipped the refresh would play differently from the game, and any tool that
        // later refreshed them (a crop, a probe) would change what comes after.
        window.__advance = (n) => { for (let i = 0; i < n; i++) { window.__tick(1000 / 30); R.sync?.(window.__HITL.state); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
      }, time);
      pt.mark('stepDefs');
      // Tool dependencies that build three.js objects when they load (tool-preload.js) take a UUID
      // each from Math.random. Loaded here on the tool stream, they cost the game's stream nothing
      // when a check imports them later, so a result doesn't depend on which tool loaded first.
      await page.evaluate(async () => {
        const gameRandom = Math.random;
        Math.random = window.__tool(() => Math.random);
        try { await import('/blender/checks/tool-preload.js'); } finally { Math.random = gameRandom; }
      });
      pt.mark('toolPreload');
      // Cold-start cost for this one page: navigation, model/font readiness, and tool preload. Added
      // to startHarness()'s own phases, this is where openScene's time actually goes.
      return { page, errors, requests, phases: pt.phases };
    },
    async close() { await Promise.all(launched.map((l) => l.browser.close())); await server.close(); },
  };
}
