// The browser half of compare.mjs: the same sampleMock call in the harness page.
//   node blender/checks/node/compare-browser.mjs [--mock floor] [--seconds 6]
import { startHarness } from '../harness.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const mock = opt('mock', 'floor'), seconds = Number(opt('seconds', 6));
const t0 = Date.now();
const H = await startHarness({ gpu: true });
const tH = Date.now();
const { page } = await H.openScene(`quality=low&mock=${mock}`, { width: 1600, height: 1000 });
const tO = Date.now();
await page.evaluate(() => { const R = window.__hitlRender, r = R.render.bind(R); R.render = (dt, o) => r(dt, { draw: false, ...o }); });
await page.evaluate(() => { window.__step = window.__advance; });
const r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleMock(o), { name: mock, seconds, every: 1, known: [], worst: {}, crops: 0, propDesks: 0, moments: null, grid: false, item: null });
const tS = Date.now();
console.log(`browser: harness up ${tH - t0} ms, scene open ${tO - tH} ms, sampleMock ${tS - tO} ms`);
console.log(`browser: ${r.violations.length} violations`);
for (const v of r.violations) console.log('B', v.check, v.key, v.value);
await H.close();
