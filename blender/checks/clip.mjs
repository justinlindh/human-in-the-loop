// Clipping checks on real furniture (src/render/checks.js), run headless against the mock office.
//
//   node blender/checks/clip.mjs          prints one line per check; exits 1 if any fails
//   node blender/checks/clip.mjs --rig    the same with authored clips on (?rig=1)
//
// Seated desk poses in every mood, head bounds, and resting perk poses (couch, beanbag, nap pod,
// arcade stool, library armchair), and pair games (foosball) starting on their own on the floor and
// in the garage. Runs through harness.mjs, so the result depends only on the code.
import { startHarness } from './harness.mjs';
import { inputHash, passedAt, recordPass } from './cache.mjs';

const rig = process.argv.includes('--rig') ? '&rig=1' : '';
// A full pass is recorded against a hash of every input (cache.mjs); unchanged inputs skip the run.
const hash = inputHash('clip', rig);
const before = passedAt('clip', hash);
if (before) {
  console.log(`clip${rig ? ' --rig' : ''}: inputs unchanged since ${before}, skipped`);
  process.exit(0);
}
const H = await startHarness();
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
  // Then until every person with a desk sits at it (someone may be on a water break), so the
  // desk checks always cover every desk.
  const away = () => R.office.current.desks.filter((d) => {
    const who = S.staff.find((p) => R.perks.peek(p.id)?.seat === d.id);
    if (!who) return false;
    let root = null; R.scene.traverse((o) => { if (o.userData.staffId === who.id) root = o.parent; });
    return !root || Math.hypot(root.position.x - d.seat.x, root.position.z - d.seat.z) > 0.2;
  });
  for (let i = 0; i < 900 && away().length; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
  const unseated = away().map((d) => d.id);
  const a = await C.runClipChecks(R, S);
  const b = await C.runPerkChecks(R, S, [
    { id: 'k_couch', label: 'couch:sit' }, { id: 'k_couch', nap: true, label: 'couch:nap' }, { id: 'k_bean', soft: true, label: 'beanbag:sprawl' }, { id: 'k_pod', label: 'napPod:lie' },
    { id: 'k_arc', label: 'arcade:stool' }, { id: 'k_lib', slot: 1, label: 'library:armchair' }]);
  const seatCheck = { name: 'desks:all-seated', pass: unseated.length === 0, unseated };
  await (await import('/src/render/rig.js')).loadRig();
  const dance = [];
  for (const g of ['motivational_polka', 'corporate_synthwave', 'aggressive_bossa_nova', 'sad_lofi']) dance.push(await C.runDanceCheck(R, S, g));
  const w = await C.runWalkChecks(R, S);
  w.push(...await C.runPropChecks(R, S));
  // Counters and wall items, each on free tiles with a clear row in front (the perk items above go first).
  S.office.placed = S.office.placed.filter((p) => !p.id.startsWith('k_'));
  for (let i = 0; i < 60; i++) { R.sync(S); R.advance(1 / 30); }
  const pairs = await C.runPairCheck(R, S, 'floor');
  R.perks.hold = true;
  const { footprint } = await import('/src/render/layout.js');
  const L = R.office.current.L;
  const used = new Set();
  const mark = (p) => { const f = footprint(p.itemId, p.rot); for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) used.add(`${p.x + x},${p.y + y}`); };
  S.office.placed.forEach(mark);
  for (const [x, y] of L.blocked) used.add(`${x},${y}`);
  const free = (x, y, fw, fh) => { for (let i = -1; i <= fw; i++) for (let j = 0; j <= fh; j++) if (used.has(`${x + i},${y + j}`)) return false; return x > 0 && y + fh < L.grid.h - 1 && x + fw < L.grid.w; };
  const USE = [['espresso', 1], ['espresso', 2], ['espresso', 3], ['coffee_corner', 1], ['plant_wall', 1], ['plant_wall', 3], ['bookshelf', 1]];
  const useIds = [];
  USE.forEach(([itemId, level], n) => {
    const f = footprint(itemId, 0);
    for (let y = 0; y < L.grid.h - 2; y++) for (let x = 1; x < L.grid.w - f.w; x++) {
      if (useIds.length > n || !free(x, y, f.w, f.h)) continue;
      const p = { id: `use${n}`, itemId, level, x, y, rot: 0 };
      S.office.placed.push(p); mark(p); for (let i = 0; i < f.w; i++) used.add(`${x + i},${y + f.h}`);
      useIds.push(p.id);
    }
  });
  for (let i = 0; i < 10; i++) { R.sync(S); R.advance(1 / 30); }
  const u = await C.runUseChecks(R, S, useIds);
  dance.push(await C.runDanceLengthCheck(R, S));
  const party = await C.runPartyCheck(R, S);
  return [seatCheck, ...a.results, ...b.results, ...dance, ...w, ...u, party, pairs];
});
// The garage: two founders still get a game of foosball in now and then.
{
  const g = await H.openScene(`quality=low&mock=garage${rig}`, { width: 800, height: 500 });
  out.push(await g.page.evaluate(async () => {
    const R = window.__hitlRender, S = window.__HITL.state;
    const C = await import('/src/render/checks.js');
    for (let i = 0; i < 120; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
    return C.runPairCheck(R, S, 'garage');
  }));
  errors.push(...g.errors);
  await g.page.close();
}
await H.close();
let failed = 0;
for (const r of out) {
  if (!r.pass) failed++;
  const { name, pass, ...nums } = r;
  console.log(`CLIP ${pass ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(nums)}`);
}
if (errors.length) { failed++; console.log(`page errors: ${errors.join('; ')}`); }
console.log(`clip: ${out.length - failed} of ${out.length} passed`);
if (!failed) recordPass('clip', hash);
process.exit(failed ? 1 : 0);
