// Math.random calls per frame and who made them, in Node or (--browser) the harness page, to find the
// first frame two runs consume the stream differently.
//   node blender/checks/node/rand.mjs --mock hq --frames 70 [--browser]
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const mock = opt('mock', 'hq'), frames = Number(opt('frames', 70));
const run = (total) => {
  const orig = Math.random;
  let cur = null;
  const rows = [];
  Math.random = () => {
    const st = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.replace(/^\s*at /, '').replace(/\(?(?:file|http)[^)]*?\/((?:src|blender|node_modules)\/[^:)]*):(\d+):\d+\)?/, '$1:$2').replace(/\s+/g, ' ')).find((l) => /src\/|blender\//.test(l) && !/three/.test(l)) ?? 'other';
    cur.n++; cur.by[st] = (cur.by[st] ?? 0) + 1;
    return orig();
  };
  for (let f = 0; f < total; f++) { cur = { f, n: 0, by: {} }; window.__advance(1); rows.push(cur); }
  Math.random = orig;
  return rows.filter((r) => r.n).map((r) => `${r.f} ${r.n} ${Object.entries(r.by).map(([k, v]) => `${k.replace(/^.*?(src\/|blender\/)/, '$1')}x${v}`).join(' ')}`);
};
if (argv.includes('--browser')) {
  const { startHarness } = await import('../harness.mjs');
  const H = await startHarness({ gpu: true });
  const { page } = await H.openScene(`quality=low&mock=${mock}`, { width: 1600, height: 1000 });
  console.log((await page.evaluate(`(${run.toString()})(${frames})`)).join('\n'));
  await H.close();
} else {
  const { openNodeScene } = await import('./scene.mjs');
  const N = await openNodeScene({ mock, quality: 'low' });
  console.log(run(frames).join('\n'));
  await N.close();
}
