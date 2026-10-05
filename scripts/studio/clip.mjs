#!/usr/bin/env node
// The clip check on the studio engine: the page functions blender/checks/clip.mjs runs in a browser
// (blender/checks/clip-pages.js), hosted on a Node scene (no Vite, browser or render slot), each group in
// its own process so no group starts from another's state. Prints the same CLIP lines.
//   node scripts/studio/clip.mjs [--group seats,perks] [--jobs 4] [--rig]
// `sky` reads pixels back from a 2D canvas, which the engine does not draw, so it is not run here;
// blender/checks/clip.mjs runs it in a browser beside the engine groups.
import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { GROUPS, OWN_PAGE } from '../../blender/checks/clip-groups.mjs';
import * as PAGES from '../../blender/checks/clip-pages.js';
import { fastRaycast } from './page-host.mjs';

export const BROWSER_ONLY = ['sky'];
export const ENGINE_GROUPS = Object.keys(GROUPS).filter((g) => !BROWSER_ONLY.includes(g));
const self = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// One group in this process: a fresh scene, the harness's page globals, then the group's page function.
async function playGroup(group, rig) {
  const own = PAGES.OWN_PAGES[group];
  const { createRuntime } = await import('./runtime.mjs');
  const rt = await createRuntime({ mock: own?.mock ?? 'floor', quality: 'low', era: own?.era ?? null, rig: (own ? own.rig : true) && rig ? true : null, initialSync: false });
  globalThis.__fastRaycast = fastRaycast(rt.R);
  globalThis.__hitlRender = rt.R;
  globalThis.__HITL = { state: rt.S };
  globalThis.__tick = () => rt.clock.tick();
  // The steppers the harness gives every page (harness.mjs), which checks.js calls by name.
  const { R, S } = rt;
  // Nothing is drawn: the checks' own R.render calls step the scene without the final draw.
  const render = R.render.bind(R);
  R.render = (dt, o) => render(dt, { draw: false, ...o });
  globalThis.__advance = (n) => { for (let i = 0; i < n; i++) { globalThis.__tick(); R.sync?.(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
  globalThis.__step = (n) => { for (let i = 0; i < n; i++) { globalThis.__tick(); R.sync?.(S); R.render(1 / 30, { draw: false }); } };
  globalThis.__sample = globalThis.__step;
  globalThis.__settle = globalThis.__step;
  // The browser harness resets the game's random stream once the page's own bootstrap (its first sync) is done.
  rt.clock.reseed();
  // A page function imports by site path; here those are files under the repo.
  globalThis.__imp = (p) => import(p.startsWith('/') ? pathToFileURL(ROOT + p.slice(1)).href : p);
  // Evaluated from source, as a page receives it, so it can only reach what a page could.
  const asPage = (fn) => (0, eval)(`(${String(fn).replace(/\bimport\(/g, '__imp(')})`);
  await asPage(PAGES.installExact)();
  if (own) return PAGES.prefixed(own, await asPage(own.fn)(own.arg));
  return asPage(PAGES.mainPage)(Object.fromEntries(Object.keys(GROUPS).filter((g) => !OWN_PAGE.includes(g)).map((g) => [g, g === group])));
}

// Plays each group in its own process, `jobs` at a time. Returns { results: { group: cases[] }, errors },
// where an error names a group whose process ended without results.
export async function runGroups({ groups = ENGINE_GROUPS, rig = false, jobs = Math.max(1, cpus().length >> 3) } = {}) {
  const results = {}, errors = [];
  const running = new Set();
  const stop = (sig) => () => { for (const p of running) p.kill('SIGTERM'); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGHUP' ? 1 : 15)); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, stop(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, groups.length) }, async () => {
      while (next < groups.length) {
        const group = groups[next++];
        await new Promise((done) => {
          const p = fork(self, ['--one', group, ...(rig ? ['--rig'] : [])], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
          running.add(p);
          let err = '';
          p.stderr.on('data', (d) => { err += d; });
          p.on('message', (m) => { if (m.error) errors.push(`${group}: ${m.error}`); else results[group] = m.cases; });
          p.on('exit', (code, signal) => {
            running.delete(p);
            if (!(group in results) && !errors.some((e) => e.startsWith(`${group}:`))) {
              const tail = err.split('\n').filter((l) => l && !/^(BVH:|THREE\.WebGLRenderer: scene-engine: unsupported canvas context)/.test(l)).slice(-3).join(' | ');
              errors.push(`${group}: exited ${code ?? signal}${tail ? `: ${tail}` : ''}`);
            }
            done();
          });
        });
      }
    }));
  } finally {
    for (const [s, h] of handlers) process.off(s, h);
  }
  return { results, errors };
}

export const clipLine = (r) => { const { name, pass, worstAt, ...nums } = r; return `CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`; };

if (process.argv[1] === self) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const rig = argv.includes('--rig');
  if (opt('one')) {
    try {
      const cases = await playGroup(opt('one'), rig);
      await new Promise((done) => process.send({ cases }, done));
      process.exit(0);
    } catch (e) {
      await new Promise((done) => process.send({ error: e.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e) }, done));
      process.exit(1);
    }
  }
  const groups = opt('group', ENGINE_GROUPS.join(',')).split(',').filter(Boolean);
  const bad = groups.filter((g) => !ENGINE_GROUPS.includes(g));
  if (bad.length) { console.error(`studio clip: unknown group ${bad.join(', ')} (want ${ENGINE_GROUPS.join(', ')}; ${BROWSER_ONLY.join(', ')} runs in the browser, in blender/checks/clip.mjs)`); process.exit(2); }
  const jobs = Number(opt('jobs', Math.max(1, cpus().length >> 3)));
  if (!(Number.isInteger(jobs) && jobs >= 1)) { console.error(`studio clip: --jobs wants a whole number of at least 1 (got ${opt('jobs')})`); process.exit(2); }
  const { results, errors } = await runGroups({ groups, rig, jobs });
  let failed = errors.length;
  for (const g of groups) for (const r of results[g] ?? []) { if (!r.pass) failed++; console.log(clipLine(r)); }
  for (const e of errors) console.log(`studio clip: ${e}`);
  process.exit(failed ? 1 : 0);
}
