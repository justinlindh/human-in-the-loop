// The clip check's page functions, run by blender/checks/clip.mjs in a browser page and by
// scripts/studio/clip.mjs on the studio engine. Each one is sent as source (Playwright serializes it; the
// engine evaluates the same text with its imports read from the repo), so none may use anything from
// this module's scope: everything it needs comes from window or a dynamic import by site path.

// Installed in each page: measures also count triangles crossing furniture (blender/checks/clip-exact.js),
// which a vertex count misses on a thin slab. The module and its trees are made on the tool stream so
// the game's random stream is untouched.
export const installExact = async () => {
  const C = await import('/src/render/checks.js');
  const tool = window.__tool(() => Math.random), game = Math.random;
  Math.random = tool;
  let X;
  try { X = await import('/blender/checks/clip-exact.js'); } finally { Math.random = game; }
  C.useExactCross((...a) => window.__tool(() => X.crossFraction(...a)));
};

// The floor office: `runs` names the one group this page plays (each group gets a fresh page).
export const mainPage = async (runs) => {
  const R = window.__hitlRender, S = window.__HITL.state;
  // The ownership trace, for the failure detail (the worst actor's last trace lines).
  if (R.trace) R.trace.on = true;
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
  const a = runs.seats ? await C.runClipChecks(R, S) : { results: [] };
  const b = !runs.perks ? { results: [] } : await C.runPerkChecks(R, S, [
    { id: 'k_couch', label: 'couch:sit' }, { id: 'k_couch', nap: true, label: 'couch:nap' }, { id: 'k_bean', soft: true, label: 'beanbag:sprawl' }, { id: 'k_pod', label: 'napPod:lie' },
    { id: 'k_arc', label: 'arcade:stool' }, { id: 'k_lib', slot: 1, label: 'library:armchair' }]);
  const seatCheck = { name: 'desks:all-seated', pass: unseated.length === 0, unseated };
  await (await import('/src/render/rig.js')).loadRig();
  const dance = [];
  if (runs.dance) for (const g of ['motivational_polka', 'corporate_synthwave', 'aggressive_bossa_nova', 'sad_lofi']) dance.push(await C.runDanceCheck(R, S, g));
  const pet = runs.pets ? await C.runPetChecks(R, S) : [];
  const robot = runs.robot ? await C.runRobotChecks(R, S) : [];
  const w = runs.walk ? await C.runWalkChecks(R, S) : [];
  w.push(...pet, ...robot);
  if (runs.props) w.push(...await C.runPropChecks(R, S));
  if (runs.y2k) w.push(...await C.runY2kChecks(R, S));
  // Counters and wall items, each on free tiles with a clear row in front (the perk items above go first).
  S.office.placed = S.office.placed.filter((p) => !p.id.startsWith('k_'));
  for (let i = 0; i < 60; i++) { R.sync(S); R.advance(1 / 30); }
  const pairs = runs.pairs ? await C.runPairCheck(R, S, 'floor') : null;
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
  const u = runs.use ? await C.runUseChecks(R, S, useIds) : [];
  if (runs.dance) dance.push(await C.runDanceLengthCheck(R, S));
  const party = runs.party ? await C.runPartyCheck(R, S) : null;
  const sky = runs.sky ? await C.runSkyCheck() : null;
  return [runs.seats ? seatCheck : null, ...a.results, ...b.results, ...dance, ...w, ...u, party, sky, pairs].filter(Boolean);
};

// The garage: two founders still get a game of foosball in now and then.
export const garagePage = async () => {
  const R = window.__hitlRender, S = window.__HITL.state;
  const C = await import('/src/render/checks.js');
  for (let i = 0; i < 120; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
  return [await C.runPairCheck(R, S, 'garage')];
};

export const celebrationsPage = async () => {
  const C = await import('/src/render/checks.js');
  return C.runCelebrationChecks(window.__hitlRender, window.__HITL.state);
};

export const respondPage = async () => {
  const C = await import('/src/render/checks.js');
  return C.runRespondChecks(window.__hitlRender, window.__HITL.state);
};

// Planted control: a slab far thinner than the vertex spacing through a head. The vertex count of
// the old measure reads nothing; the exact measure must flag it.
export const controlPage = async () => {
  const R = window.__hitlRender, S = window.__HITL.state;
  const C = await import('/src/render/checks.js');
  const T = R.THREE;
  for (let i = 0; i < 30; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
  let root = null, head = null;
  R.scene.traverse((o) => { if (!root && o.userData.staffId === S.staff[0].id) root = o.parent; });
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (!head && o.isMesh && o.userData.part === 'head') head = o; });
  const c = new T.Box3().setFromObject(head).getCenter(new T.Vector3());
  const slab = window.__tool(() => new T.Mesh(new T.BoxGeometry(2, 0.004, 2), new T.MeshBasicMaterial()));
  slab.position.copy(c);
  R.scene.add(slab); slab.updateMatrixWorld(true);
  const pts = C.probe.vertices(root, 8);
  const old = C.probe.insideCount(pts, [slab]) / pts.length;
  const now = C.probe.bodyInside(root, [slab]);
  R.scene.remove(slab);
  return [{ name: 'control:head-through-slab', pass: old === 0 && now > 0.01, vertexShare: +old.toFixed(4), exactShare: +now.toFixed(4) }];
};

// The groups that open their own scene: the mock, whether --rig applies (the garage plays with the rig
// asked for; the floor pages here always play without it), and the page function. Every other group
// runs mainPage on a fresh floor-office page.
export const OWN_PAGES = {
  garage: { mock: 'garage', rig: true, fn: garagePage },
  celebrations: { mock: 'floor', rig: false, fn: celebrationsPage },
  respond: { mock: 'floor', rig: false, fn: respondPage },
  control: { mock: 'floor', rig: false, fn: controlPage },
};
