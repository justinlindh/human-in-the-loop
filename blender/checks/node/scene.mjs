// A game scene in plain Node: the game's own render code on three.js with no browser, no GL and no
// render slot. WebGLRenderer is a stand-in (three-shim.mjs), the page globals are stubs, and the
// harness's clock and random streams are reproduced so a scene steps the way harness.mjs's page does.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const noop = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true });
// Any DOM method the game calls that isn't listed does nothing.
const el = () => new Proxy(elBase(), { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const elBase = () => ({ width: 1, height: 1, clientWidth: 1600, clientHeight: 1000, style: {}, children: [], appendChild() {}, addEventListener() {}, removeEventListener() {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 1000 }), setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {} } });

function installGlobals(search) {
  const g = globalThis;
  g.document = { createElement: el, createElementNS: el, getElementById: () => el(), head: el(), body: el(), documentElement: el(), addEventListener() {}, hidden: false, querySelectorAll: () => [], querySelector: () => null, fonts: { load: async () => [], ready: Promise.resolve(), check: () => true, addEventListener() {} } };
  g.self ??= g; g.window = g;
  g.innerWidth = 1600; g.innerHeight = 1000; g.devicePixelRatio = 1;
  g.location = { search, href: `http://node/${search}` };
  g.addEventListener = () => {}; g.removeEventListener = () => {};
  Object.defineProperty(g, 'navigator', { value: { userAgent: 'node', hardwareConcurrency: 4 }, configurable: true });
  g.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  g.ResizeObserver = class { observe() {} disconnect() {} };
  g.Image = class { set src(v) {} addEventListener() {} };
  g.ProgressEvent ??= class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
  const real = g.fetch;
  g.Request = class { constructor(url, init = {}) { this.url = String(url); this.headers = new Headers(init.headers); this.method = 'GET'; } };
  g.fetch = async (url, o) => { const u = typeof url === 'string' ? url : url.url; if (/^https?:/.test(u)) return real(u, o); return new Response(readFileSync(join(ROOT, 'public', decodeURIComponent(u.replace(/^\//, '')))), { status: 200 }); };
  // The harness clock and streams (harness.mjs INIT).
  const SEED = 1234567; let s = SEED; const game = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  let ts = 7654321; const tool = () => { ts = (ts * 16807) % 2147483647; return (ts - 1) / 2147483646; };
  Math.random = game;
  g.__tool = (fn) => { const prev = Math.random; Math.random = tool; try { return fn(); } finally { Math.random = prev; } };
  g.__reseedGame = () => { s = SEED; };
  let t = 0;
  g.__clock = { now: () => t };
  g.__tick = (ms) => { t += ms; };
  performance.now = () => t; Date.now = () => 1700000000000 + t;
  g.__rafQ = []; g.requestAnimationFrame = (cb) => { g.__rafQ.push(cb); return g.__rafQ.length; };
}

export async function openNodeScene({ mock = 'floor', quality = 'low', rig = null } = {}) {
  const realNow = performance.now.bind(performance);
  const t0 = realNow();
  installGlobals(`?snap=1&quality=${quality}&mock=${mock}${rig == null ? '' : `&rig=${rig ? 1 : 0}`}`);
  const vite = await createServer({ root: ROOT, configFile: false, resolve: { alias: [{ find: /^three$/, replacement: join(import.meta.dirname, 'three-shim.mjs') }] }, ssr: { noExternal: ['three', 'three-mesh-bvh'] }, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { createMockSim } = await vite.ssrLoadModule('/src/dev/mockSim.js');
  const { createRenderer } = await vite.ssrLoadModule('/src/render/index.js');
  const m = createMockSim({ scenario: mock, seed: 7 });
  const R = createRenderer({ canvas: el(), labelsEl: el(), quality });
  for (let i = 0; i < 400 && !R.ready; i++) await new Promise((r) => setTimeout(r, 5));
  if (!R.ready) throw new Error('node scene: the renderer never became ready');
  const S = m.state;
  globalThis.__noScreen = true; // the screen-space checks read real DOM layout and stay in the browser
  globalThis.__hitlRender = R;
  globalThis.__HITL = { state: S, dispatch: (a) => m.dispatch(a) };
  globalThis.__reseedGame();
  R.setSpeed?.(1); R.setPaused?.(false); R.setTimeOfDay?.(0.45);
  const step = (n) => { for (let i = 0; i < n; i++) { globalThis.__tick(1000 / 30); R.sync?.(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
  globalThis.__advance = step;
  // Nothing is drawn in Node; a browser run that matches steps with draw: false.
  const render = R.render.bind(R);
  R.render = (dt, o) => render(dt, { draw: false, ...o });
  globalThis.__step = (n) => { for (let i = 0; i < n; i++) { globalThis.__tick(1000 / 30); R.sync?.(S); R.render(1 / 30); } };
  const gameRandom = Math.random; Math.random = globalThis.__tool(() => Math.random);
  try { await vite.ssrLoadModule('/blender/checks/tool-preload.js'); } finally { Math.random = gameRandom; }
  return { R, S, vite, load: (p) => vite.ssrLoadModule(p), startMs: realNow() - t0, close: () => vite.close() };
}
