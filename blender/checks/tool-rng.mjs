// Checks that tools can't change what they measure by how or when they load: importing any page-side
// tool module in blender/checks takes nothing from the game's Math.random stream (a module that
// builds three.js objects when it loads would, one UUID each), and a scene played after a second of
// idle page time matches one played at once. And a page can't reach the network: a request off the
// harness's server is blocked and reported (the harness enforces it; this checks it still does).
// node blender/checks/tool-rng.mjs          (under timeout; the harness takes the render lock)
// Exit 0 when both hold, 1 with what broke.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarness } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// Page modules: the .js files here that don't use Node.
const modules = readdirSync(here).filter((f) => f.endsWith('.js') && !/from 'node:|require\(/.test(readFileSync(join(here, f), 'utf8')));
const H = await startHarness();
let code = 0;
try {
  const { page } = await H.openScene('quality=medium&mock=floor&rig=1', { width: 960, height: 600 });
  const draws = await page.evaluate(async (mods) => {
    const out = {};
    for (const m of mods) {
      const game = Math.random; let n = 0;
      Math.random = function () { n++; return game.apply(this, arguments); };
      try { await import(`/blender/checks/${m}`); } catch (e) { out[m] = `import failed: ${e.message}`; continue; } finally { Math.random = game; }
      out[m] = n;
    }
    return out;
  }, modules);
  await page.close();
  for (const [m, n] of Object.entries(draws)) {
    const ok = n === 0;
    if (!ok) code = 1;
    console.log(`TOOL-RNG ${ok ? 'ok  ' : 'FAIL'} import ${m}: ${typeof n === 'number' ? `${n} draws from the game's stream` : n}`);
  }

  const play = async (idleMs) => {
    const { page: p } = await H.openScene('quality=medium&mock=floor&rig=1', { width: 960, height: 600 });
    const hashes = await p.evaluate(async (idleMs) => {
      const R = window.__hitlRender;
      if (idleMs) await new Promise((r) => setTimeout(r, idleMs));
      window.__settle(30);
      const out = [];
      for (let f = 0; f < 120; f += 10) {
        window.__sample(10);
        let h = 0; R.scene.traverse((o) => { const e = o.matrixWorld.elements; h += e[12] * 3 + e[13] * 5 + e[14] * 7; });
        out.push(h.toFixed(9));
      }
      return out;
    }, idleMs);
    await p.close();
    return hashes;
  };
  {
    const { page: p, errors } = await H.openScene('quality=low&mock=garage', { width: 320, height: 200 });
    const got = await p.evaluate(() => fetch('https://example.com/').then(() => 'reached', () => 'failed'));
    const reported = errors.some((e) => e.includes('blocked a network request') && e.includes('example.com'));
    await p.close();
    const ok = got === 'failed' && reported;
    if (!ok) code = 1;
    console.log(`TOOL-RNG ${ok ? 'ok  ' : 'FAIL'} network: a page's request to example.com is ${got === 'failed' ? 'blocked' : 'NOT blocked'}${reported ? ' and reported' : ', not reported'}`);
  }
  const [now, later] = [await play(0), await play(1000)];
  const at = now.findIndex((h, i) => h !== later[i]);
  if (at >= 0) code = 1;
  console.log(`TOOL-RNG ${at < 0 ? 'ok  ' : 'FAIL'} idle before warm-up: 0 ms and 1000 ms ${at < 0 ? `match over ${now.length * 10} frames` : `differ from frame ${at * 10 + 10}`}`);
} finally {
  await H.close();
}
process.exit(code);
