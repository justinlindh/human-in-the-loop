// The clip check's floor-office groups in plain Node: clip.mjs's own page function, run against a Node
// scene with its dynamic imports going through Vite. Prints the same CLIP lines.
//   node blender/checks/node/clip.mjs [--group seats,perks]
import { readFileSync } from 'node:fs';
import { openNodeScene } from './scene.mjs';
const argv = process.argv.slice(2);
const groups = (argv[argv.indexOf('--group') + 1] ?? 'seats,perks').split(',');
const src = readFileSync(new URL('../clip.mjs', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('const got = await page.evaluate(async (runs) => {') + 'const got = await page.evaluate('.length, src.indexOf('}, Object.fromEntries(MAIN.map') + 1);
const ALL = ['seats', 'perks', 'dance', 'walk', 'pets', 'props', 'pairs', 'use', 'party', 'sky'];
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;
for (const group of groups) {
  const t0 = ms();
  const N = await openNodeScene({ mock: 'floor', quality: 'low' });
  globalThis.__imp = (p) => (p.startsWith('/') ? N.load(p) : import(p));
  const fn = (0, eval)(`(${body.replace(/\bimport\(/g, '__imp(')})`);
  const tR = ms();
  const res = await fn(Object.fromEntries(ALL.map((g) => [g, g === group])));
  for (const r of res) { const { name, pass, worstAt, ...nums } = r; console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`); }
  console.log(`node clip ${group}: ${res.length} cases, open ${(tR - t0).toFixed(0)} ms, run ${(ms() - tR).toFixed(0)} ms`);
  await N.close();
}
