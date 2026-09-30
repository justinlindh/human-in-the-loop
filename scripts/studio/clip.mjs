#!/usr/bin/env node
// The clip check's floor-office groups on the studio engine: the same page function blender/checks/clip.mjs
// runs in the browser, hosted on a Node scene (no Vite, browser or render slot), each group in its own
// process so no group starts from another's state. Prints the same CLIP lines.
//   node scripts/studio/clip.mjs [--group seats,perks] [--jobs 4]
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
// The floor-office groups. `sky` reads pixels back from a 2D canvas, which stays a browser check.
const ALL = ['seats', 'perks', 'dance', 'walk', 'pets', 'robot', 'props', 'y2k', 'pairs', 'use', 'party'];
const groups = (opt('group', ALL.join(',')) ).split(',').filter(Boolean);
const bad = groups.filter((g) => !ALL.includes(g));
if (bad.length) { console.error(`studio clip: unknown group ${bad.join(', ')} (want ${ALL.join(', ')})`); process.exit(2); }
const self = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

if (opt('one')) {
  const group = opt('one');
  const { createRuntime } = await import('./runtime.mjs');
  const rt = await createRuntime({ mock: 'floor', quality: 'low', initialSync: false });
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
  // The page function imports by URL path from the site root; here they are files under the repo.
  globalThis.__imp = (p) => import(p.startsWith('/') ? pathToFileURL(ROOT + p.slice(1)).href : p);
  const src = readFileSync(new URL('../../blender/checks/clip.mjs', import.meta.url), 'utf8');
  const from = (needle, what) => { const i = src.indexOf(needle); if (i < 0) throw new Error(`studio clip: blender/checks/clip.mjs no longer has ${what}`); return i; };
  const remap = (s) => s.replace(/\bimport\(/g, '__imp(');
  const exactAt = from('const installExact = async () => {', 'installExact');
  const installExact = src.slice(exactAt + 'const installExact = '.length, from('const noMatch', 'noMatch')).trim().replace(/;$/, '');
  await (0, eval)(`(${remap(installExact)})`)();
  const bodyAt = from('const got = await page.evaluate(async (runs) => {', 'the main page function') + 'const got = await page.evaluate('.length;
  const body = src.slice(bodyAt, from('}, Object.fromEntries(MAIN.map', 'the main group call') + 1);
  const results = await (0, eval)(`(${remap(body)})`)(Object.fromEntries(ALL.map((g) => [g, g === group])));
  for (const r of results) { const { name, pass, worstAt, ...nums } = r; console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`); }
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}

// The driver: one process per group, a few at a time, output in group order.
const jobs = Number(opt('jobs', Math.max(1, cpus().length >> 3)));
const outputs = new Array(groups.length).fill('');
let next = 0, failed = 0;
const kill = () => { for (const p of running) p.kill('SIGTERM'); process.exit(143); };
const running = new Set();
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, kill);
await Promise.all(Array.from({ length: Math.min(jobs, groups.length) }, async () => {
  while (next < groups.length) {
    const i = next++;
    await new Promise((resolve) => {
      const p = spawn(process.execPath, [self, '--one', groups[i]], { stdio: ['ignore', 'pipe', 'pipe'] });
      running.add(p);
      p.stdout.on('data', (d) => { outputs[i] += d; });
      p.stderr.on('data', (d) => { if (!/^(BVH:|THREE\.WebGLRenderer: scene-engine: unsupported canvas context)/.test(String(d))) outputs[i] += d; });
      p.on('close', (code) => { running.delete(p); if (code) failed++; resolve(); });
    });
  }
}));
process.stdout.write(outputs.join(''));
process.exit(failed ? 1 : 0);
