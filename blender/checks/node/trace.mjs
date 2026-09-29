// Everyone's position and the random stream every 50 frames after the sampler's own 90-frame start,
// in Node or (--browser) the harness page with drawing off, to find the first frame two runs diverge.
//   node blender/checks/node/trace.mjs --mock hq --frames 900 [--browser]
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const mock = opt('mock', 'hq'), frames = Number(opt('frames', 900));
const trace = (total) => {
  const R = window.__hitlRender;
  R.render(0);
  const rows = [];
  for (let f = 0; f < total; f += 5) {
    window.__advance(5);
    const ppl = [];
    R.scene.traverse((o) => { if (o.name === 'character') { const p = o.getWorldPosition(new o.position.constructor()); ppl.push(`${o.children.find((c) => c.userData.staffId !== undefined)?.userData.staffId}:${p.x.toFixed(3)},${p.z.toFixed(3)}`); } });
    rows.push(`${f + 5} ${ppl.join(' ')}`);
  }
  return rows;
};
if (argv.includes('--browser')) {
  const { startHarness } = await import('../harness.mjs');
  const H = await startHarness({ gpu: true });
  const { page } = await H.openScene(`quality=low&mock=${mock}`, { width: 1600, height: 1000 });
  await page.evaluate(() => { const R = window.__hitlRender, r = R.render.bind(R); R.render = (dt, o) => r(dt, { draw: false, ...o }); });
  console.log((await page.evaluate(`(${trace.toString()})(${frames})`)).join('\n'));
  await H.close();
} else {
  const { openNodeScene } = await import('./scene.mjs');
  const N = await openNodeScene({ mock, quality: 'low' });
  console.log(trace(frames).join('\n'));
  await N.close();
}
