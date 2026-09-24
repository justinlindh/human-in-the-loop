// Clipping checks on real furniture (src/render/checks.js), run headless against the mock office.
//
//   node blender/checks/clip.mjs      prints one line per check; exits 1 if any fails
//
// Seated desk poses in every mood, head bounds, and resting perk poses (couch, beanbag, nap pod,
// arcade stool, library armchair).
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?snap=1&quality=low&mock=floor`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 120000 });
const out = await page.evaluate(async () => {
  const R = window.__hitlRender, S = window.__HITL.state;
  const C = await import('/src/render/checks.js');
  const moods = ['ok', 'coasting', 'burnout', 'tired'];
  S.staff.forEach((p, i) => { const m = moods[i % 4]; if (m === 'tired') { p.mood = 'ok'; p.stamina = 10; } else { p.mood = m; p.stamina = 80; } p.assignment = { type: 'project', targetId: null }; });
  S.office.placed.push(
    { id: 'k_couch', itemId: 'couch', level: 1, x: 1, y: 9, rot: 0 }, { id: 'k_bean', itemId: 'nap_pod', level: 1, x: 3, y: 9, rot: 0 },
    { id: 'k_pod', itemId: 'nap_pod', level: 2, x: 4, y: 9, rot: 0 }, { id: 'k_arc', itemId: 'arcade', level: 2, x: 11, y: 10, rot: 0 },
    { id: 'k_lib', itemId: 'library', level: 2, x: 12, y: 8, rot: 3 });
  await new Promise((r) => setTimeout(r, 2000));
  R.advance(2);
  const a = await C.runClipChecks(R, S);
  const b = await C.runPerkChecks(R, S, [
    { id: 'k_couch', label: 'couch:sit' }, { id: 'k_bean', label: 'beanbag:sprawl' }, { id: 'k_pod', label: 'napPod:lie' },
    { id: 'k_arc', label: 'arcade:stool' }, { id: 'k_lib', slot: 1, label: 'library:armchair' }]);
  return [...a.results, ...b.results];
});
await browser.close();
await server.close();
let failed = 0;
for (const r of out) {
  if (!r.pass) failed++;
  const { name, pass, ...nums } = r;
  console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`);
}
if (errors.length) { failed++; console.log(`page errors: ${errors.join('; ')}`); }
console.log(`clip: ${out.length - failed} of ${out.length} passed`);
process.exit(failed ? 1 : 0);
