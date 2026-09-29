// The sweep's sampleLoaded on an indexed moment's snapshot, in Node or (--browser) the harness page.
//   node blender/checks/node/loaded.mjs --snapshot <file.json.gz> [--browser]
import { basename } from 'node:path';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const snapshot = opt('snapshot');
const args = { label: `snap:${basename(snapshot)}`, open: 16, after: 8, every: 1, choice: 0, known: [], worst: {}, crops: 0, item: null };
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const t0 = ms();
let r, tOpen;
if (argv.includes('--browser')) {
  const { startHarness } = await import('../harness.mjs');
  const { resolveTarget, openAt } = await import('../../../scripts/events/load.js');
  const H = await startHarness({ gpu: true });
  const o = await openAt(H, resolveTarget({ snapshot }), { width: 1600, height: 1000, quality: 'low' });
  await o.page.evaluate(() => { const R = window.__hitlRender, f = R.render.bind(R); R.render = (dt, x) => f(dt, { draw: false, ...x }); window.__step = window.__advance; });
  tOpen = ms();
  r = await o.page.evaluate(async (a) => (await import('/blender/checks/sample.js')).sampleLoaded(a), args);
  await H.close();
} else {
  const { openNodeScene } = await import('./scene.mjs');
  const N = await openNodeScene({ mock: 'floor', quality: 'low', snapshot });
  globalThis.__step = globalThis.__advance;
  tOpen = ms();
  r = await (await N.load('/blender/checks/sample.js')).sampleLoaded(args);
  await N.close();
}
console.log(`${argv.includes('--browser') ? 'browser' : 'node'}: open ${(tOpen - t0).toFixed(0)} ms, sampleLoaded ${(ms() - tOpen).toFixed(0)} ms, ${r.violations.length} violations, ${JSON.stringify(r.windows)}`);
for (const v of r.violations) console.log('V', v.check, v.key, v.value);
