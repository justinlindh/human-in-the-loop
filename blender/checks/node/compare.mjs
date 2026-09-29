// Runs the sweep's mock sampler in plain Node (the browser half is compare-browser.mjs) and prints the
// violations and real elapsed time (the scene's clock is virtual, so time comes from hrtime).
//   node blender/checks/node/compare.mjs [--mock floor] [--seconds 6]
import { openNodeScene } from './scene.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const mock = opt('mock', 'floor'), seconds = Number(opt('seconds', 6));
const ms = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const t0 = ms();
const N = await openNodeScene({ mock, quality: 'low' });
const tO = ms();
console.log(`node: scene ready ${(tO - t0).toFixed(0)} ms`);
globalThis.__step = globalThis.__advance;
const { sampleMock } = await N.load('/blender/checks/sample.js');
const tS = ms();
const r = await sampleMock({ name: mock, seconds, every: 1, known: [], worst: {}, crops: 0, propDesks: 0, moments: null, grid: false, item: null });
console.log(`node: sampleMock ${(ms() - tS).toFixed(0)} ms`);
console.log(`node: ${r.violations.length} violations`);
for (const v of r.violations) console.log('N', v.check, v.key, v.value);
await N.close();
