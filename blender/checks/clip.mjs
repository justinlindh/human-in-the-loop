// Clipping checks on real furniture (src/render/checks.js), run headless against the mock office.
//
//   node blender/checks/clip.mjs          prints one line per check; exits 1 if any fails
//   node blender/checks/clip.mjs --rig    the same with authored clips on (?rig=1)
//
// Seated desk poses in every mood, head bounds, and resting perk poses (couch, beanbag, nap pod,
// arcade stool, library armchair). Runs through harness.mjs, so the result depends only on the code.
import { startHarness } from './harness.mjs';

const H = await startHarness();
const rig = process.argv.includes('--rig') ? '&rig=1' : '';
const { page, errors } = await H.openScene(`quality=low&mock=floor${rig}`, { width: 800, height: 500 });
const out = await page.evaluate(async () => {
  const R = window.__hitlRender, S = window.__HITL.state;
  const C = await import('/src/render/checks.js');
  const moods = ['ok', 'coasting', 'burnout', 'tired'];
  S.staff.forEach((p, i) => { const m = moods[i % 4]; if (m === 'tired') { p.mood = 'ok'; p.stamina = 10; } else { p.mood = m; p.stamina = 80; } p.assignment = { type: 'project', targetId: null }; });
  S.office.placed.push(
    { id: 'k_couch', itemId: 'couch', level: 1, x: 1, y: 9, rot: 0 }, { id: 'k_bean', itemId: 'nap_pod', level: 1, x: 3, y: 9, rot: 0 },
    { id: 'k_pod', itemId: 'nap_pod', level: 2, x: 4, y: 9, rot: 0 }, { id: 'k_arc', itemId: 'arcade', level: 2, x: 11, y: 10, rot: 0 },
    { id: 'k_lib', itemId: 'library', level: 2, x: 12, y: 8, rot: 3 });
  // Everyone walks to their seat and settles, with no perk visits starting, so every desk is
  // checked; the clock only moves with these steps.
  R.perks.hold = true;
  for (let i = 0; i < 120; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
  const a = await C.runClipChecks(R, S);
  const b = await C.runPerkChecks(R, S, [
    { id: 'k_couch', label: 'couch:sit' }, { id: 'k_couch', nap: true, label: 'couch:nap' }, { id: 'k_bean', label: 'beanbag:sprawl' }, { id: 'k_pod', label: 'napPod:lie' },
    { id: 'k_arc', label: 'arcade:stool' }, { id: 'k_lib', slot: 1, label: 'library:armchair' }]);
  return [...a.results, ...b.results];
});
await H.close();
let failed = 0;
for (const r of out) {
  if (!r.pass) failed++;
  const { name, pass, ...nums } = r;
  console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`);
}
if (errors.length) { failed++; console.log(`page errors: ${errors.join('; ')}`); }
console.log(`clip: ${out.length - failed} of ${out.length} passed`);
process.exit(failed ? 1 : 0);
