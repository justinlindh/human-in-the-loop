// The sweep's bodies and people after 90 frames, in Node or (--browser), for a direct diff.
//   node blender/checks/node/bodies.mjs --mock hq [--browser]
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const mock = opt('mock', 'hq');
const measure = async () => {
  const X = await import('/blender/checks/intersect.js');
  const R = window.__hitlRender;
  window.__advance(90);
  const list = X.bodies(R);
  const f = (b) => `${b.key}|${b.kind}|${['x', 'y', 'z'].map((k) => b.box.min[k].toFixed(3) + '..' + b.box.max[k].toFixed(3)).join(' ')}|m${b.meshes?.length}`;
  const ps = X.people(R, list);
  return [`bodies ${list.length}`, ...list.map(f), `people ${ps.length}`, ...ps.map(f)];
};
if (argv.includes('--browser')) {
  const { startHarness } = await import('../harness.mjs');
  const H = await startHarness({ gpu: true });
  const { page } = await H.openScene(`quality=low&mock=${mock}`, { width: 1600, height: 1000 });
  console.log((await page.evaluate(`(${measure.toString()})()`)).join('\n'));
  await H.close();
} else {
  const { openNodeScene } = await import('./scene.mjs');
  const N = await openNodeScene({ mock, quality: 'low' });
  globalThis.__importX = (p) => N.load(p);
  const src = measure.toString().replace("await import('/blender/checks/intersect.js')", "await globalThis.__importX('/blender/checks/intersect.js')");
  console.log((await (0, eval)(`(${src})`)()).join('\n'));
  await N.close();
}
