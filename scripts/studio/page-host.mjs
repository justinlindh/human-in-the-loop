// Harness page functions on the studio engine: a check's page function (the one blender/checks/harness.mjs
// runs with page.evaluate) plays on a Node scene with the globals a harness page gives it, with no Vite,
// browser or render slot. Each case runs in its own process, so no case starts from another's state.
//
//   import { runCases } from '../../scripts/studio/page-host.mjs'
//   const results = await runCases([{ page: { mock: 'floor', quality: 'low' }, module: '/abs/standup-pages.js', fn: 'geometry', arg }], { jobs: 4 })
//
// A case is { page, module, fn, arg }: `page` the scene a harness URL would open (mock or seed, quality,
// rig), `module` an absolute path to a module exporting `fn(arg)`. Each result is { value } or { error }.
import { fork } from 'node:child_process';
import { registerHooks } from 'node:module';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const self = fileURLToPath(import.meta.url);
const ROOT = new URL('../../', import.meta.url);

// Opens one scene and installs what a harness page has: the renderer and state, the clock and steppers,
// the game-stream reseed, and imports by site path (`/src/...`, `/blender/...`) from this checkout.
export async function openPage({ mock = 'floor', seed, week, quality = 'low', rig = null } = {}) {
  registerHooks({
    resolve(specifier, context, next) {
      if (/^\/(src|blender|scripts|public)\//.test(specifier)) return next(new URL(specifier.slice(1), ROOT).href, context);
      return next(specifier, context);
    },
  });
  const { createRuntime } = await import('./runtime.mjs');
  const { resolveState } = await import('./state.mjs');
  const state = seed == null ? undefined : await resolveState({ seed, week });
  const rt = await createRuntime({ state, mock, quality, rig, initialSync: false });
  const { R, S } = rt;
  const g = globalThis;
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
