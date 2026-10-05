// Harness page functions on the studio engine: a check's page function (the one blender/checks/harness.mjs
// runs with page.evaluate) plays on a Node scene with the globals a harness page gives it, with no Vite,
// browser or render slot. Each case runs in its own process, so no case starts from another's state.
//
//   import { runCases } from '../../scripts/studio/page-host.mjs'
//   const results = await runCases([{ page: { mock: 'floor', quality: 'low' }, module: '/abs/standup-pages.js', fn: 'geometry', arg }], { jobs: 4 })
//
// A case is { page, module, fn, arg }: `page` the scene a harness URL would open (mock or seed, with
// `weeks` played as the page plays them or `week` played by the bots, quality, rig, the viewport's
// width and height, and --param overrides as param.js resolves them), `module` an
// absolute path to a module exporting `fn(arg)`. Each result is { value } or { error }.
import { fork } from 'node:child_process';
import { registerHooks } from 'node:module';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const ROOT = new URL('../../', import.meta.url);

// A page's `?seed=N&weeks=W` game (src/main.js): W weeks, each open decision answered with its first choice.
async function pageWeeks(seed, weeks) {
  const { createGame, tick, dispatch } = await import('../../src/sim/index.js');
  const S = createGame({ seed: Number(seed) });
  for (let i = 0; i < weeks; i++) {
    if (S.pendingDecision) dispatch(S, { type: 'resolveDecision', choice: 0 });
    if (S.gameOver) break;
    tick(S);
  }
  return S;
}

// Opens one scene and installs what a harness page has: the renderer and state, the clock and steppers,
// the game-stream reseed, the tool-side helpers (__wallNow, __drawAudit, __fastRaycast), and imports by
// site path (`/src/...`, `/blender/...`) from this checkout.
export async function openPage({ mock = 'floor', seed, week, weeks, quality = 'low', rig = null, width, height, params = [] } = {}) {
  registerHooks({
    resolve(specifier, context, next) {
      if (/^\/(src|blender|scripts|public)\//.test(specifier)) return next(new URL(specifier.slice(1), ROOT).href, context);
      return next(specifier, context);
    },
  });
  const { createRuntime } = await import('./runtime.mjs');
  const { resolveState } = await import('./state.mjs');
  let transform;
  if (params.length) {
    const { applyParams } = await import('../../blender/checks/param.js');
    const byFile = Map.groupBy(params, (p) => p.file);
    transform = (file, source) => (byFile.has(file) ? applyParams(source, byFile.get(file)) : source);
  }
  const state = seed == null ? undefined : weeks ? await pageWeeks(seed, weeks) : await resolveState({ seed, week });
  const rt = await createRuntime({ state, mock, quality, rig, width, height, transform, initialSync: false });
  const { R, S } = rt;
  const g = globalThis;
  // The platform's performance.now is the frame clock; a tool's timings read the wall.
  g.__wallNow = () => Number(process.hrtime.bigint()) / 1e6;
  // Nothing here reaches a GPU, so every draw count is zero.
  g.__drawAudit = () => ({ total: 0 });
  // As the harness page's: tool modules that make three.js objects on load (each takes a UUID from
  // Math.random) load on the tool stream, and __fastRaycast patches raycast to per-mesh trees.
  {
    const game = Math.random;
    Math.random = g.__tool(() => Math.random);
    try { await import('../../blender/checks/bvh.js'); } finally { Math.random = game; }
  }
  g.__fastRaycast = fastRaycast(R);
  g.__hitlRender = R;
  g.__HITL = { state: S };
  // The page's clock moves in milliseconds; the engine's in frames of 1/30 s.
  let carry = 0;
  g.__tick = (ms = 1000 / 30) => { carry += ms; while (carry >= 1000 / 30 - 1e-9) { rt.clock.tick(); carry -= 1000 / 30; } };
  // Nothing is drawn: a check's own R.render calls step the scene without the final draw.
  const render = R.render.bind(R);
  R.render = (dt, o) => render(dt, { draw: false, ...o });
  g.__advance = (n) => { for (let i = 0; i < n; i++) { g.__tick(1000 / 30); R.sync?.(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
  g.__step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1000 / 30); R.sync?.(S); R.render(1 / 30, { draw: false }); } };
  g.__sample = g.__step;
  g.__settle = g.__step;
  g.__reseedGame = () => rt.clock.reseed();
  // The browser harness resets the game's random stream once the page's own bootstrap is done.
  rt.clock.reseed();
  return rt;
}

// The harness page's __fastRaycast for renderer R (blender/checks/bvh.js patchRaycast). The module
// is already loaded on the tool stream by then (openPage, or the clip page's installExact).
export function fastRaycast(R) {
  const g = globalThis;
  return async ({ install = true } = {}) => {
    if (g.__fastRaycastOn || !install) return;
    const bvh = await import('../../blender/checks/bvh.js');
    bvh.patchRaycast(R.THREE, g.__tool);
    g.__fastRaycastOn = true;
  };
}

// Runs the cases `jobs` at a time, each in its own process; results in case order.
export async function runCases(cases, { jobs = Math.max(1, cpus().length >> 3) } = {}) {
  const results = new Array(cases.length);
  const running = new Set();
  const stop = (sig) => () => { for (const p of running) p.kill('SIGTERM'); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGHUP' ? 1 : 15)); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, stop(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, cases.length) }, async () => {
      while (next < cases.length) {
        const i = next++;
        results[i] = await new Promise((done) => {
          const p = fork(self, ['--case'], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
          running.add(p);
          let err = '', got = null;
          p.stderr.on('data', (d) => { err += d; });
          p.on('message', (m) => { got = m; });
          p.on('exit', (code, signal) => {
            running.delete(p);
            const tail = err.split('\n').filter((l) => l && !/^(BVH:|THREE\.WebGLRenderer: scene-engine: unsupported canvas context)/.test(l)).slice(-3).join(' | ');
            done(got ?? { error: `case process exited ${code ?? signal}${tail ? `: ${tail}` : ''}` });
          });
          p.send(cases[i]);
        });
      }
    }));
  } finally {
    for (const [s, h] of handlers) process.off(s, h);
  }
  return results;
}

if (process.argv[1] === self && process.argv[2] === '--case') {
  process.once('message', async (c) => {
    let reply;
    try {
      await openPage(c.page);
      const mod = await import(pathToFileURL(c.module).href);
      reply = { value: await mod[c.fn](c.arg) };
    } catch (e) {
      reply = { error: e?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e) };
    }
    process.send(reply, () => process.exit(0));
  });
}
