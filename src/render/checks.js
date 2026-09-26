import * as THREE from 'three';

// Clipping checks run against the live renderer (dev builds and snaps): people are put in each
// seated or lying pose on real furniture, stepped through the animation, and measured.
//
//   hands:   on a desk, typing hands rest on the surface under them (not below it, not floating)
//   inside:  share of a person's vertices that end up inside the furniture they use
//   reach:   the person's head stays within its own bounds (nothing sticks out of it)
//
// runClipChecks(renderer, state) -> { pass, results: [{ name, pass, ...numbers }] }

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

function charOf(scene, staffId) {
  let root = null;
  scene.traverse((o) => { if (o.userData.staffId === staffId) root = o.parent; });
  return root;
}

function meshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !o.isSprite && o.userData.staffId === undefined) out.push(o); });
  return out;
}

// Sample world-space vertices of a character (every `step`th), skipping pick proxies and sprites.
function vertices(root, step = 3, filter = () => true) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.staffId !== undefined || o.material?.transparent || !o.visible || !filter(o)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += step) out.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone());
  });
  return out;
}

// Parity test: a point is inside a closed mesh when a ray from it crosses the surface an odd
// number of times. Furniture is closed enough (boxes, cylinders) for this to hold.
function insideCount(points, targets) {
  const saved = targets.map((m) => m.material.side);
  for (const m of targets) m.material.side = THREE.DoubleSide;
  // Inside only if both an upward and a downward ray cross an odd number of surfaces, so open
  // shells (a nap pod canopy, a lamp shade) do not count as solid.
  let n = 0;
  for (const p of points) {
    ray.set(p, UP);
    if (ray.intersectObjects(targets, false).length % 2 === 0) continue;
    ray.set(p, DOWN);
    if (ray.intersectObjects(targets, false).length % 2 === 1) n++;
  }
  targets.forEach((m, i) => { m.material.side = saved[i]; });
  return n;
}

function surfaceBelow(p, targets) {
  ray.set(new THREE.Vector3(p.x, p.y + 0.5, p.z), DOWN);
  const h = ray.intersectObjects(targets, false)[0];
  return h ? h.point.y : null;
}

const isArm = (o) => o.userData.part === 'armL' || o.userData.part === 'armR';
// The body above the hips: legs are meant to sit in chairs and on cushions.
const isUpper = (o) => ['head', 'torso', 'armL', 'armR'].includes(o.userData.part);
const HEAD_C = 0.22;               // head centre above the neck pivot (chibi.py)

function headCentre(root) {
  let head = null;
  root.traverse((o) => { if (!head && o.userData.part === 'head') head = o; });
  return head;
}

// The standard failure detail for an actor at the worst sample: where they stand and face, their
// walk (path, goal, the temp and who set it) and their last lines in the ownership trace.
function actorAt(R, id) {
  const root = charOf(R.scene, id);
  if (!root) return { id };
  return { id, pos: [+root.position.x.toFixed(2), +root.position.z.toFixed(2)], yaw: +root.rotation.y.toFixed(2), walk: R.walkOf?.(id) ?? null, trace: R.trace?.on ? R.trace.lines(600).filter((l) => l.id === id).slice(-8) : [] };
}

export async function runClipChecks(R, S, { frames = 24, dt = 0.07 } = {}) {
  const results = [];
  const scene = R.scene;
  const office = R.office;
  const step = (n) => { for (let i = 0; i < n; i++) R.advance(dt); };

  // 1. Seated desk poses: every sitter, over an animation cycle.
  const desks = office.current.desks;
  for (const d of desks) {
    const s = S.staff.find((p) => R.perks.peek(p.id)?.seat === d.id);
    if (!s) continue;
    const root = charOf(scene, s.id);
    if (!root) continue;
    // Measure only while they sit at the desk: someone off on a break is waited for, and a person
    // who never comes back is a failed check rather than a silently skipped one.
    const away = () => Math.hypot(root.position.x - d.seat.x, root.position.z - d.seat.z) > 0.2 || R.perks.peek(s.id)?.temp;
    for (let i = 0; i < 400 && away(); i++) step(1);
    if (away()) { results.push({ name: `desk:${d.id}`, pass: false, reason: 'never back at the desk' }); continue; }
    const furniture = meshes(d.obj);
    let lowGap = Infinity, highGap = -Infinity, inside = 0, total = 0;
    const byPart = {};
    for (let f = 0; f < frames; f++) {
      step(1);
      const arms = vertices(root, 1, isArm);
      // Hands: the lowest arm points, compared with the surface right under them.
      arms.sort((a, b) => a.y - b.y);
      const low = arms.slice(0, 12);
      for (const p of low) {
        const y = surfaceBelow(p, furniture);
        if (y === null) continue;
        lowGap = Math.min(lowGap, p.y - y);
        highGap = Math.max(highGap, p.y - y);
      }
      if (f % 6 === 0) {
        for (const part of ['head', 'torso', 'armL', 'armR']) {
          const pts = vertices(root, 4, (o) => o.userData.part === part);
          const n = insideCount(pts, furniture);
          inside += n; total += pts.length;
          byPart[part] = (byPart[part] ?? 0) + n;
        }
      }
    }
    const anim = R.perks.peek(s.id)?.temp?.anim ?? (s.stamina < 25 ? 'tired' : { ok: 'typing', coasting: 'slumped', burnout: 'burnout' }[s.mood]);
    const insidePct = total ? (100 * inside) / total : 0;
    // Resting hands sit on the surface: never more than 1 cm into it, and burnout arms lie on the desk.
    const pass = lowGap > -0.012 && insidePct < 1;
    results.push({ name: `desk:${d.id}:${anim}`, pass, handGapMin: +lowGap.toFixed(3), handGapMax: +highGap.toFixed(3), insidePct: +insidePct.toFixed(2), byPart });
  }

  // 2. Heads stay within their own bounds (hair, hats, glasses do not stick out).
  for (const s of S.staff.slice(0, 12)) {
    const root = charOf(scene, s.id);
    const head = root && headCentre(root);
    if (!head) continue;
    head.updateMatrixWorld(true);
    // In the head's own frame (front is +z): nothing sticks out sideways, forward, or up much past
    // the widest designed parts (a headset boom, a cap bill, a beanie pom); long hair down the back is fine.
    let side = 0, front = 0, top = 0;
    const p = head.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      side = Math.max(side, Math.abs(p.getX(i)));
      front = Math.max(front, p.getZ(i));
      top = Math.max(top, p.getY(i) - HEAD_C);
    }
    results.push({ name: `head:${s.id}:${s.appearance?.accessory ?? 'none'}:${s.appearance?.hair}`, pass: side < 0.35 && front < 0.34 && top < 0.36,
      side: +side.toFixed(3), front: +front.toFixed(3), top: +top.toFixed(3) });
  }

  return { pass: results.every((r) => r.pass), results };
}

// Float gap: how far the body hangs above the furniture under it. Any sampled point inside the
// furniture is contact (0); otherwise the smallest drop from a point to the surface below it.
function floatGap(points, targets) {
  const saved = targets.map((m) => m.material.side);
  for (const m of targets) m.material.side = THREE.DoubleSide;
  let gap = Infinity;
  for (const p of points) {
    ray.set(p, UP);
    const up = ray.intersectObjects(targets, false).length;
    ray.set(p, DOWN);
    const down = ray.intersectObjects(targets, false);
    if (up % 2 === 1 && down.length % 2 === 1) { gap = 0; break; }
    if (down.length) gap = Math.min(gap, down[0].distance);
  }
  targets.forEach((m, i) => { m.material.side = saved[i]; });
  return gap;
}

const FLOAT_MAX = 0.03;           // resting on furniture: the body comes within 3 cm of it
const SOFT_SINK = 0.35;           // soft furniture (a beanbag): the body sinks this far below its top

// Furniture poses: send one person to each item and measure how much of them sinks into it.
// Items with soft: true may swallow the body; only the head must stay clear, and the body must sink.
export async function runPerkChecks(R, S, items, { settle = 12, frames = 12, dt = 0.1 } = {}) {
  const results = [];
  const staff = S.staff.filter((p) => p.mood !== 'away').map((p) => p.id);
  let k = 0;
  for (const { id, slot = 0, nap = false, soft = false, label } of items) {
    const who = staff[k++ % staff.length];
    if (!R.perks.send([who], id, { dur: 60, slot, nap })) { results.push({ name: label, pass: false, reason: 'not sent' }); continue; }
    const e = R.office.placed.get(id);
    const root = charOf(R.scene, who);
    const furniture = meshes(e.obj);
    // The approach: nothing of the body goes through the item on the walk there, and getting onto
    // it (the slide from its front) keeps the upper body out of it.
    let walkIn = 0, enterIn = 0;
    for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) {
      R.advance(0.1);
      const pts = vertices(root, 6);
      walkIn = Math.max(walkIn, insideCount(pts, furniture) / pts.length);
    }
    for (let i = 0; i < 10; i++) {
      R.advance(0.08);
      const pts = vertices(root, 6, isUpper);
      enterIn = Math.max(enterIn, insideCount(pts, furniture) / pts.length);
    }
    for (let i = 0; i < settle; i++) R.advance(dt);
    let inside = 0, total = 0, headIn = 0, headTotal = 0, gap = 0, low = Infinity;
    const top = new THREE.Box3().setFromObject(e.obj).max.y;
    for (let f = 0; f < frames; f++) {
      R.advance(dt);
      const body = vertices(root, 4);
      gap = Math.max(gap, floatGap(body, furniture));
      for (const p of body) low = Math.min(low, p.y);
      const pts = vertices(root, 4, isUpper);
      inside += insideCount(pts, furniture);
      total += pts.length;
      const head = headCentre(root);
      if (head) {
        const hp = vertices(head.parent, 3);
        headIn += insideCount(hp, furniture);
        headTotal += hp.length;
      }
    }
    const pct = total ? (100 * inside) / total : 0;
    const headPct = headTotal ? (100 * headIn) / headTotal : 0;
    const sunk = top - low;
    const pass = headPct < 1 && gap < FLOAT_MAX && (soft ? sunk > SOFT_SINK : pct < 2) && walkIn === 0 && (soft || enterIn < 0.05);
    results.push({ name: label, anim: R.perks.peek(who)?.temp?.anim, pass, insidePct: +pct.toFixed(2), headInsidePct: +headPct.toFixed(2),
      floatGap: +gap.toFixed(3), walkInsidePct: +(100 * walkIn).toFixed(2), enterUpperInsidePct: +(100 * enterIn).toFixed(2), ...(soft ? { sunkBelowTop: +sunk.toFixed(2) } : {}) });
  }
  return { pass: results.every((r) => r.pass), results };
}

// Music night: during the dance no dancer's body is inside any furniture or another dancer's space,
// and once the break ends everyone is back at their desk.
export async function runDanceCheck(R, S, genre, { dt = 1 / 30 } = {}) {
  const ids = S.staff.map((p) => p.id);
  R.handleEvents([{ type: 'incentive', staffId: ids[0], reward: 'music_night', genre, dancers: ids.slice(1, 4) }], S);
  const d = R.incentives?.dance;
  const dancers = (d?.dancers ?? ids.slice(0, 4)).map((id) => charOf(R.scene, id)).filter(Boolean);
  const furniture = [];
  for (const e of R.office.placed.values()) furniture.push(...meshes(e.obj));
  let inside = 0, total = 0, minGap = Infinity;
  for (let f = 0; f < 18 * 30; f++) {
    R.advance(dt);
    if (f < 120 || f > 440 || f % 15) continue;
    for (const root of dancers) {
      const pts = vertices(root, 8);
      inside += insideCount(pts, furniture);
      total += pts.length;
    }
    for (let i = 0; i < dancers.length; i++) for (let j = i + 1; j < dancers.length; j++) {
      minGap = Math.min(minGap, Math.hypot(dancers[i].position.x - dancers[j].position.x, dancers[i].position.z - dancers[j].position.z));
    }
  }
  const desks = R.office.current.desks;
  const involved = new Set([...(d?.dancers ?? []), ...(d?.crowd ?? [])]);
  const notBack = () => S.staff.filter((p) => involved.has(p.id)).filter((p) => {
    const seat = R.perks.peek(p.id)?.seat;
    const desk = desks.find((x) => x.id === seat);
    const root = charOf(R.scene, p.id);
    return desk && root && Math.hypot(root.position.x - desk.seat.x, root.position.z - desk.seat.z) > 0.2;
  }).map((p) => p.id);
  // Give the walk home up to 30 s (a water break on the way back is allowed).
  for (let i = 0; i < 900 && notBack().length; i++) R.advance(dt);
  const away = notBack();
  const insidePct = total ? (100 * inside) / total : 0;
  return { name: `dance:${genre}`, pass: dancers.length >= 4 && insidePct < 0.5 && minGap > 0.55 && away.length === 0,
    dancers: dancers.length, insidePct: +insidePct.toFixed(2), minGap: +minGap.toFixed(2), notBackAtDesk: away };
}

// Walking among furniture (issue #134):
//   dropOnWalk: a desk placed across someone's walk; they re-path and never pass through it.
//   dropOnStand: a desk placed where someone stands; they step out of it.
//   walkers: over a stretch of normal office life, nobody's body (arms aside) enters furniture other
//            than their own desk or the item they are getting on or off.
//   use:<item>: someone using a counter or wall item stands within USE_MAX of its front, inside nothing.
const USE_MAX = 0.45;
// arms: false leaves out swinging arms (a walker's arm may brush an edge they walk past).
function bodyInside(root, targets, arms = true) {
  const pts = vertices(root, 8, arms ? () => true : (o) => !isArm(o));
  return pts.length ? insideCount(pts, targets) / pts.length : 0;
}
function furnitureOf(R, skip = new Set()) {
  const out = [];
  for (const e of R.office.placed.values()) if (!skip.has(e.id)) out.push(...meshes(e.obj));
  return out;
}

export async function runWalkChecks(R, S, { dt = 1 / 30 } = {}) {
  const results = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) { R.sync(S); R.advance(dt); } };
  const ids = S.staff.map((p) => p.id);
  const deskOf = (id) => R.perks.peek(id)?.seat;

  // 1. A desk dropped across an active walk.
  {
    const who = ids[0];
    const root = charOf(R.scene, who);
    const L = R.office.current.L;
    const target = R.office.current.zones.door;
    // Walk to the far corner area, then drop a desk on the path a couple of meters ahead.
    const perks = [...R.office.placed.values()].filter((e) => ['couch', 'nap_pod', 'arcade', 'library', 'espresso', 'coffee_corner'].includes(e.itemId));
    const far = perks.sort((a, b) => Math.hypot(b.target.x - root.position.x, b.target.z - root.position.z) - Math.hypot(a.target.x - root.position.x, a.target.z - root.position.z))[0];
    R.perks.send([who], far.id, { dur: 20 });
    step(15);
    const pos = root.position;
    const dir = { x: far.target.x - pos.x, z: far.target.z - pos.z };
    const len = Math.hypot(dir.x, dir.z) || 1;
    const ahead = { x: pos.x + (dir.x / len) * 1.6, z: pos.z + (dir.z / len) * 1.6 };
    const tx = Math.floor(ahead.x + L.W / 2), ty = Math.floor(ahead.z + L.D / 2);
    S.office.placed.push({ id: 'walk_drop', itemId: 'desk', level: 1, x: tx, y: Math.min(ty, L.D - 2), rot: 0 });
    step(2);
    const drop = R.office.placed.get('walk_drop');
    const targets = meshes(drop.obj);
    let worst = 0;
    for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) { step(1); if (i % 3 === 0) worst = Math.max(worst, bodyInside(root, targets)); }
    results.push({ name: 'walk:dropOnWalk', pass: worst === 0, insidePct: +(100 * worst).toFixed(2), tile: [tx, ty], void: target && 0 });
    S.office.placed = S.office.placed.filter((p) => p.id !== 'walk_drop');
    step(10);
  }

  // 2. A desk dropped where someone stands.
  {
    const who = ids[1];
    const root = charOf(R.scene, who);
    const L = R.office.current.L;
    // Stand them on open floor: a 1x2 spot with nothing on it or next to it.
    R.perks.hold = true;
    const nav = R.office.nav();
    let tx = -1, ty = -1;
    for (let y = 1; y < L.grid.h - 3 && tx < 0; y++) for (let x = 1; x < L.grid.w - 1 && tx < 0; x++) {
      let ok = true;
      for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 2 && ok; j++) if (nav.isBlocked(x + i - L.W / 2 + 0.5, y + j - L.D / 2 + 0.5)) ok = false;
      if (ok) { tx = x; ty = y; }
    }
    step(1);
    R.standAt(who, tx - L.W / 2 + 0.5, ty - L.D / 2 + 0.3);
    step(1);
    const rec = R.perks.peek(who);
    S.office.placed.push({ id: 'stand_drop', itemId: 'desk', level: 1, x: tx, y: ty, rot: 0 });
    step(2);
    const drop = R.office.placed.get('stand_drop');
    let inside = 1;
    const before = { x: +root.position.x.toFixed(2), z: +root.position.z.toFixed(2), blocked: nav.isBlocked(root.position.x, root.position.z, 0.2), path: R.perks.peek(who)?.path };
    for (let i = 0; i < 90; i++) step(1);
    globalThis.__dbgStand = { before, after: { x: +root.position.x.toFixed(2), z: +root.position.z.toFixed(2), path: R.perks.peek(who)?.path, temp: R.perks.peek(who)?.temp?.anim } };
    inside = bodyInside(root, meshes(drop.obj));
    results.push({ name: 'walk:dropOnStand', pass: inside === 0, insidePct: +(100 * inside).toFixed(2), ...globalThis.__dbgStand });
    S.office.placed = S.office.placed.filter((p) => p.id !== 'stand_drop');
    S.staff[1].assignment = { type: 'project', targetId: null };
    step(10);
  }

  // 3. Normal office life: walkers never inside furniture (a sitter's own desk excepted).
  {
    R.perks.hold = false;
    let worst = 0, worstWho = null, worstAt = null, samples = 0;
    for (let f = 0; f < 30 * 40; f++) {
      step(1);
      if (f % 10) continue;
      for (const id of ids) {
        const pk = R.perks.peek(id);
        if (!pk?.path) continue;
        const root = charOf(R.scene, id);
        if (!root) continue;
        const own = new Set([deskOf(id)]);
        // The item they are heading onto (a couch) is theirs too while they get on it.
        if (pk.temp?.key) own.add(pk.temp.key.split(':')[0]);
        if (pk.exitFrom) own.add(pk.exitFrom);
        samples++;
        for (const e of R.office.placed.values()) {
          if (own.has(e.id)) continue;
          const v = bodyInside(root, meshes(e.obj), false);
          if (v > worst) { worst = v; worstWho = `${id} in ${e.itemId}:${e.id} (${pk.temp?.key ?? 'goal'}) at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)} own ${deskOf(id)} item at ${e.target.x.toFixed(2)},${e.target.z.toFixed(2)} path ${pk.path}`; worstAt = actorAt(R, id); }
        }
      }
    }
    R.perks.hold = true;
    results.push({ name: 'walk:walkers', pass: worst < 0.01 && samples > 20, worstInsidePct: +(100 * worst).toFixed(2), worstWho, worstAt, samples });
  }
  return results;
}

// Use spots for counters and wall items: send someone to each placed item id, measure after arrival.
export async function runUseChecks(R, S, itemIds, { dt = 1 / 30 } = {}) {
  const results = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) { R.sync(S); R.advance(dt); } };
  const ids = S.staff.map((p) => p.id);
  let k = 0;
  const THREEv = new THREE.Vector3();
  for (const pid of itemIds) {
    const e = R.office.placed.get(pid);
    const who = ids[k++ % ids.length];
    if (!R.perks.send([who], pid, { dur: 30 })) { results.push({ name: `use:${e?.itemId ?? pid}`, pass: false, reason: 'not sent' }); continue; }
    for (let i = 0; i < 600 && R.perks.peek(who)?.path; i++) step(1);
    step(20);
    const root = charOf(R.scene, who);
    // Distance from the person to the model's front face, in the item's frame.
    e.obj.updateMatrixWorld(true);
    const inv = e.obj.matrixWorld.clone().invert();
    const local = THREEv.copy(root.position).applyMatrix4(inv);
    const box = new THREE.Box3();
    e.obj.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(inv))); } });
    const gap = local.z - box.max.z;
    const inOther = bodyInside(root, furnitureOf(R));
    results.push({ name: `use:${e.itemId}_l${e.level}`, pass: gap > 0 && gap < USE_MAX && inOther === 0 && Math.abs(local.x) < (box.max.x - box.min.x) / 2 + 0.3,
      frontGap: +gap.toFixed(2), across: +local.x.toFixed(2), insidePct: +(100 * inOther).toFixed(2) });
    R.perks.send([who], pid, { dur: 0.01 });
    step(5);
  }
  return results;
}

// Waffle party (issue #150): the watchers crowd in on the camera side of the table, outside furniture.
export async function runPartyCheck(R, S, { dt = 1 / 30 } = {}) {
  R.handleEvents([{ type: 'incentive', staffId: S.staff[0].id, reward: 'waffle_party' }], S);
  for (let i = 0; i < 8 * 30; i++) { R.sync(S); R.advance(dt); }
  const p = R.incentives?.party;
  if (!p) return { name: 'waffle:crowd', pass: false, reason: 'no party' };
  // On the camera side: at least 0.3 m nearer the camera than the table, along the camera's heading.
  const cam = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
  const all = [];
  for (const e of R.office.placed.values()) all.push(...meshes(e.obj));
  let behind = 0, inside = 0;
  for (const id of p.watchers) {
    const root = charOf(R.scene, id);
    const toward = (root.position.x - p.center.x) * cam.x + (root.position.z - p.center.z) * cam.z;
    if (toward < 0.3) behind++;
    const pts = vertices(root, 8, (o) => !isArm(o));
    if (insideCount(pts, all) / pts.length > 0.01) inside++;
  }
  for (let i = 0; i < 12 * 30; i++) { R.sync(S); R.advance(dt); }
  return { name: 'waffle:crowd', pass: p.watchers.length === 3 && behind === 0 && inside === 0, watchers: p.watchers.length, behindTable: behind, insideFurniture: inside };
}

// Music night follows the track (audio's hitl:musicTrack { genre, seconds, startsIn }): the dance
// lasts until the music ends, and 15 s without an announcement.
export async function runDanceLengthCheck(R, S, { dt = 1 / 30 } = {}) {
  const ids = S.staff.map((p) => p.id);
  const run = (announce) => {
    R.handleEvents([{ type: 'incentive', staffId: ids[0], reward: 'music_night', genre: 'sad_lofi', dancers: ids.slice(1, 4) }], S);
    if (announce) dispatchEvent(new CustomEvent('hitl:musicTrack', { detail: { genre: 'sad_lofi', ...announce } }));
    let t = 0;
    while (R.incentives?.dance && t < 40) { R.sync(S); R.advance(dt); t += dt; }
    for (let i = 0; i < 400; i++) { R.sync(S); R.advance(dt); }
    return t;
  };
  const plain = run(null);
  const long = run({ seconds: 18.85, startsIn: 0.4 });
  // The break ends a second after the music (the lights come up over that second).
  const ok = (t, want) => Math.abs(t - want) < 0.2;
  return { name: 'dance:trackLength', pass: ok(plain, 16) && ok(long, 18.85 + 0.4 + 1), noTrackS: +plain.toFixed(2), withTrackS: +long.toFixed(2) };
}

// A staged standup (issue #149): once everyone has gathered, nobody stands outside the walls, inside
// furniture, or on top of someone else.
export async function runStandupCheck(R, S, { dt = 1 / 30 } = {}) {
  const lines = S.staff.filter((p) => !p.remote && p.mood !== 'away').slice(0, 8).map((p, i) => ({ staffId: p.id, text: i < 2 ? 'Shipping it today.' : null }));
  R.handleEvents([{ type: 'standup', mode: 'daily', lines }], S);
  for (let i = 0; i < 8 * 30; i++) { R.sync(S); R.advance(dt); }
  const L = R.office.current.L;
  const all = [];
  for (const e of R.office.placed.values()) all.push(...meshes(e.obj));
  let outside = 0, inside = 0, gathered = 0, minGap = Infinity;
  const at = [];
  for (const l of lines) {
    const root = charOf(R.scene, l.staffId);
    if (!root) continue;
    gathered++;
    const p = root.position;
    for (const q of at) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.z - q.z));
    at.push(p.clone());
    if (Math.abs(p.x) > L.W / 2 - 0.2 || Math.abs(p.z) > L.D / 2 - 0.2) outside++;
    if (bodyInside(root, all, false) > 0.01) inside++;
  }
  // Nobody piles onto one spot: people in a ring stand at least 0.4 m apart.
  return { pass: gathered === lines.length && outside === 0 && inside === 0 && minGap > 0.4, people: gathered, outside, insideFurniture: inside, minGap: +minGap.toFixed(2) };
}

// Staged props standing on the floor block walking like furniture: one dropped ahead of a walker
// is walked around, and one dropped where someone stands steps them aside.
export async function runPropChecks(R, S, { dt = 1 / 30 } = {}) {
  const results = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) { R.sync(S); R.advance(dt); } };
  const ids = S.staff.map((p) => p.id);
  const L = R.office.current.L;
  S.office.props ??= [];

  // 1. A curtain dropped across an active walk, on the walker's own path a little ahead.
  {
    const who = ids[2];
    const root = charOf(R.scene, who);
    const perks = [...R.office.placed.values()].filter((e) => ['couch', 'nap_pod', 'arcade', 'library', 'espresso', 'coffee_corner'].includes(e.itemId));
    const far = perks.sort((a, b) => Math.hypot(b.target.x - root.position.x, b.target.z - root.position.z) - Math.hypot(a.target.x - root.position.x, a.target.z - root.position.z))[0];
    R.perks.hold = true;
    R.perks.send([who], far.id, { dur: 20 });
    step(15);
    // The point on the remaining path about 1.2 m ahead of the walker.
    const goal = R.perks.peek(who)?.temp?.goal ?? far.target;
    const path = R.office.nav().path({ x: root.position.x, z: root.position.z }, goal) ?? [];
    let prev = { x: root.position.x, z: root.position.z }, run = 0, at = path[path.length - 1] ?? prev;
    for (const p of path) { run += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; if (run >= 1.2) { at = p; break; } }
    const tx = Math.floor(at.x + L.W / 2), ty = Math.floor(at.z + L.D / 2);
    S.office.props.push({ id: 'walk_prop', prop: 'curtain', x: tx, y: ty, since: S.week, until: { weeks: 4 } });
    step(2);
    const obj = R.props.objectOf('walk_prop');
    const targets = obj ? meshes(obj) : [];
    let worst = 0;
    for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) { step(1); if (i % 3 === 0) worst = Math.max(worst, bodyInside(root, targets)); }
    results.push({ name: 'prop:dropOnWalk', pass: !!obj && worst === 0, insidePct: +(100 * worst).toFixed(2), tile: [tx, ty] });
    S.office.props = S.office.props.filter((p) => p.id !== 'walk_prop');
    step(10);
  }

  // 2. A pet carrier dropped where someone stands.
  {
    const who = ids[3];
    const root = charOf(R.scene, who);
    const nav = R.office.nav();
    let tx = -1, ty = -1;
    for (let y = 1; y < L.grid.h - 3 && tx < 0; y++) for (let x = 2; x < L.grid.w - 2 && tx < 0; x++) {
      let ok = true;
      for (let i = -2; i <= 2 && ok; i++) for (let j = -1; j <= 1 && ok; j++) if (nav.isBlocked(x + i - L.W / 2 + 0.5, y + j - L.D / 2 + 0.5)) ok = false;
      if (ok) { tx = x; ty = y; }
    }
    step(1);
    R.standAt(who, tx - L.W / 2 + 0.5, ty - L.D / 2 + 0.5);
    step(1);
    S.office.props.push({ id: 'stand_prop', prop: 'pet_carrier', x: tx, y: ty, since: S.week, until: { weeks: 4 } });
    step(2);
    const obj = R.props.objectOf('stand_prop');
    for (let i = 0; i < 90; i++) step(1);
    const inside = obj ? bodyInside(root, meshes(obj)) : 1;
    results.push({ name: 'prop:dropOnStand', pass: !!obj && inside === 0, insidePct: +(100 * inside).toFixed(2), tile: [tx, ty] });
    S.office.props = S.office.props.filter((p) => p.id !== 'stand_prop');
    S.staff[3].assignment = { type: 'project', targetId: null };
    step(10);
  }
  // 3. Pizza on a desk: the people who gather to eat stand clear of every piece of furniture and prop.
  {
    R.moments.full = true;
    const desk = [...R.office.placed.values()].find((e) => e.desk);
    S.office.props.push({ id: 'pizza_prop', prop: 'pizza_boxes', x: desk.x, y: desk.y, since: S.week, until: { weeks: 2 } });
    let worst = 0, worstWho = null, worstAt = null;
    const eaters = new Set();
    for (let i = 0; i < 30 * 20; i++) {
      step(1);
      if (i % 5) continue;
      for (const [id, what] of R.moments.active) {
        if (what !== 'pizza') continue;
        eaters.add(id);
        const root = charOf(R.scene, id);
        // Their own desk (they get up from it) and the pizza desk (they stand at it) are theirs.
        const own = new Set([R.perks.peek(id)?.seat, desk.id]);
        for (const e of R.office.placed.values()) {
          if (own.has(e.id)) continue;
          const v = bodyInside(root, meshes(e.obj), false);
          if (v > worst) { worst = v; worstWho = `${id} in ${e.itemId}:${e.id} at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)}`; worstAt = actorAt(R, id); }
        }
        for (const p of R.props.current()) {
          if (p.prop === 'pizza_boxes') continue;
          const v = bodyInside(root, meshes(p.obj), false);
          if (v > worst) { worst = v; worstWho = `${id} in ${p.prop}`; worstAt = actorAt(R, id); }
        }
      }
    }
    results.push({ name: 'moment:pizza', pass: eaters.size > 0 && worst < 0.01, eaters: eaters.size, insidePct: +(100 * worst).toFixed(2), worstWho, worstAt });
    S.office.props = S.office.props.filter((p) => p.id !== 'pizza_prop');
    R.moments.full = false;
    step(10);
  }
  // 3b. A group prop with every desk full goes on a table, and on the same table's new spot after
  // it is moved in build mode (the same object slides there).
  {
    const tile = (() => {
      const nav = R.office.nav();
      // The table's 3 x 2 tiles clear, and one tile to the right for the move.
      for (let y = 1; y < L.grid.h - 3; y++) for (let x = 1; x < L.grid.w - 5; x++) {
        let ok = true;
        for (let i = 0; i <= 3 && ok; i++) for (let j = 0; j <= 1 && ok; j++) if (nav.isBlocked(x + i - L.W / 2 + 0.5, y + j - L.D / 2 + 0.5)) ok = false;
        if (ok) return { x, y };
      }
      return null;
    })();
    const saved = S.office.props;
    const table = tile && { id: 'counter_table', itemId: 'meeting_table', level: 1, x: tile.x, y: tile.y, rot: 0 };
    const where = [];
    if (table) {
      S.office.placed.push(table);
      step(20);
      const desks = [...R.office.placed.values()].filter((e) => e.desk);
      S.office.props = desks.flatMap((e, i) => [0, 1, 2, 3, 4, 5].map((j) => ({ id: `full${i}_${j}`, prop: 'binder', x: e.x, y: e.y, since: S.week, until: { weeks: 9 } })));
      step(10);
      for (const shift of [0, 1]) {
        if (shift) { table.x = tile.x + 1; step(60); }
        S.office.props.push({ id: 'group_prop', prop: 'pizza_boxes', x: desks[0].x, y: desks[0].y, since: S.week, until: { weeks: 2 } });
        step(2);
        const p = R.props.objectOf('group_prop'), t = R.office.placed.get(table.id);
        const box = new THREE.Box3().setFromObject(t.obj), c = p ? new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3()) : null;
        where.push(!!c && c.x > box.min.x && c.x < box.max.x && c.z > box.min.z && c.z < box.max.z && p.position.y > 0.5);
        S.office.props = S.office.props.filter((q) => q.id !== 'group_prop');
        step(2);
      }
      S.office.placed = S.office.placed.filter((q) => q.id !== table.id);
    }
    S.office.props = saved;
    step(10);
    results.push({ name: 'prop:groupOnMovedTable', pass: where.length === 2 && where.every(Boolean), onTable: where, tile });
  }
  // 4. The sledgehammer: whoever fetches it and carries it to the wall stays clear of furniture and
  // props, and the walls-down choice (decisionResolved) ends in a swing.
  {
    R.moments.full = true;
    S.pendingDecision = { eventId: 'open_plan_office', subjectId: ids[0], stage: { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 } };
    let worst = 0, worstWho = null, worstAt = null, phases = new Set();
    for (let i = 0; i < 30 * 25; i++) {
      if (i === 30 * 16) { S.pendingDecision = null; R.handleEvents([{ type: 'decisionResolved', eventId: 'open_plan_office', choice: 0, subjectId: ids[0] }], S); }
      step(1);
      const h = R.moments.hammer;
      if (!h || i % 5) continue;
      phases.add(h.phase);
      const root = charOf(R.scene, h.id);
      const own = new Set([R.perks.peek(h.id)?.seat]);
      for (const e of R.office.placed.values()) {
        if (own.has(e.id)) continue;
        const v = bodyInside(root, meshes(e.obj), false);
        if (v > worst) { worst = v; worstWho = `${h.id} (${h.phase}) in ${e.itemId}:${e.id}`; worstAt = actorAt(R, h.id); }
      }
    }
    results.push({ name: 'moment:hammer', pass: phases.has('hold') && phases.has('swing') && worst < 0.01, phases: [...phases], insidePct: +(100 * worst).toFixed(2), worstWho, worstAt });
    R.moments.full = false;
    step(10);
  }
  // 5. A letter on a desk: its sitter gets up (rolling the chair back), reads it in the aisle and sits
  // down again, clear of every piece of furniture the whole way, their own desk and chair included.
  {
    R.moments.full = true;
    R.perks.hold = true;
    step(90);
    const occupied = [...R.office.placed.values()].filter((e) => e.desk && S.staff.some((p) => R.perks.peek(p.id)?.seat === e.id && p.assignment?.type !== 'hardProblem' && p.mood !== 'away'));
    let worst = 0, worstWho = null, worstAt = null, stood = 0;
    const actors = new Set();
    for (const desk of occupied.slice(0, 4)) {
      S.office.props.push({ id: 'letter_prop', prop: 'envelope', x: desk.x, y: desk.y, since: S.week, until: { weeks: 2 } });
      // Until everyone who got up has sat down again (at most 25 s), sampling every frame.
      let seen = false;
      for (let i = 0; i < 30 * 25; i++) {
        step(1);
        if (i === 30 * 12) S.office.props = S.office.props.filter((p) => p.id !== 'letter_prop');
        if (actors.size) seen = true;
        if (seen && !actors.size) break;
        // Everyone in the moment, from getting up until they are seated again, walking back included;
        // not the seated pose itself (a sitter is meant to be in their chair).
        for (const [id, what] of R.moments.active) if (what === 'letter') actors.add(id);
        for (const id of actors) {
          if (R.isSeated(id)) { if (!R.moments.active.some(([x]) => x === id)) actors.delete(id); continue; }
          stood++;
          const root = charOf(R.scene, id);
          for (const e of R.office.placed.values()) {
            const ms = meshes(e.obj);
            const v = bodyInside(root, ms, false);
            if (v > worst) {
              worst = v;
              const parts = ms.map((m) => [m.material.name, bodyInside(root, [m], false)]).filter(([, x]) => x > 0).map(([n, x]) => `${n}:${(100 * x).toFixed(1)}`);
              worstWho = `${id} in ${e.itemId}:${e.id} [${parts.join(' ')}] path ${R.perks.peek(id)?.path}`; worstAt = actorAt(R, id);
            }
          }
        }
      }
      S.office.props = S.office.props.filter((p) => p.id !== 'letter_prop');
      step(30);
    }
    results.push({ name: 'moment:letter', pass: stood > 0 && worst < 0.01, desks: occupied.length, samples: stood, insidePct: +(100 * worst).toFixed(2), worstWho, worstAt });
    R.moments.full = false;
  }
  // 6. The printer taken out back (printer_jam, choice 0): the carriers, the one with the bat and the
  // printer itself stay clear of furniture and props from the lift to the walk-off, and the printer is
  // carried low, its top under each carrier's chin. A week's events land mid-carry (a launch party, an
  // incident, a standup) and must not call anyone away: the moment still plays to the end.
  {
    R.moments.full = true;
    S.pendingDecision = { eventId: 'printer_jam', subjectId: ids[0], stage: { prop: 'printer_jammed', anchor: 'kitchen', x: 1, y: 1 } };
    step(30);
    S.pendingDecision = null;
    S.office.props.push({ id: 'wreck_prop', prop: 'printer_wrecked', x: 1, y: 1, since: S.week, until: { weeks: 2 } });
    R.handleEvents([{ type: 'decisionResolved', eventId: 'printer_jam', choice: 0, subjectId: ids[0] }], S);
    let worst = 0, worstWho = null, worstAt = null, samples = 0, chin = Infinity, chinWho = null;
    const phases = new Set();
    const box = new THREE.Box3(), pbox = new THREE.Box3();
    // Each blow announces itself (hitl:moment 'hit', numbered from 0), for the sound to land on.
    const hits = [];
    const onHit = (e) => { if (e.detail?.phase === 'hit' && e.detail.key === 'printer_jam') hits.push(e.detail.hit); };
    addEventListener('hitl:moment', onHit);
    // It is a spotlight: announced on start and end with one key, and current while it plays.
    const spots = [];
    const onSpot = (e) => spots.push(e.detail);
    addEventListener('hitl:spotlight', onSpot);
    let spotSeen = false, quiet = null;
    for (let i = 0; i < 30 * 30; i++) {
      step(1);
      const pm = R.moments.printerState;
      if (!pm) { if (phases.size) break; continue; }
      phases.add(pm.phase);
      if (pm.phase === 'carry') spotSeen ||= R.spotlight?.()?.kind === 'printer_jam' && R.spotlight().expectedSeconds > 10;
      // Mid-carry: an unrelated line from a carrier is dropped, the moment's own line shows.
      if (pm.phase === 'carry' && pm.cue > 2 && quiet === null) {
        const id = pm.people[0].id;
        R.handleEvents([{ type: 'say', id: 'q-amb', week: S.week, staffId: id, text: 'Hello? Did I freeze?' }], S);
        step(2);
        const ambient = R.isSpeaking(id);
        R.handleEvents([{ type: 'say', id: 'q-mom', week: S.week, staffId: id, text: 'The printer has promoted itself to blocker.', moment: 'printer_jam' }], S);
        step(35);
        quiet = !ambient && R.isSpeaking(id);
      }
      if (pm.phase === 'carry' && pm.cue > 1 && !pm.interrupted) {
        pm.interrupted = true;
        R.handleEvents([{ type: 'launch' }, { type: 'incident', caught: false }, { type: 'standup', mode: 'daily', lines: S.staff.map((p) => ({ staffId: p.id, text: 'Busy.' })) }], S);
      }
      if (i % 2 || pm.phase === 'off') continue;
      samples++;
      pbox.setFromObject(pm.obj);
      pm.people.forEach((r, k) => {
        const root = charOf(R.scene, r.id);
        const own = new Set([R.perks.peek(r.id)?.seat]);
        for (const e of R.office.placed.values()) {
          if (own.has(e.id)) continue;
          const v = bodyInside(root, meshes(e.obj), false);
          if (v > worst) { worst = v; const ms = meshes(e.obj); worstWho = `${r.id} (${pm.phase} at ${pm.s.toFixed(2)} of ${pm.len.toFixed(2)} m, twist ${pm.twists?.[Math.round(pm.s / 0.1)]?.toFixed(2)}, clear ${pm.clear}, pos ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)}) in ${e.itemId}:${e.id} [${ms.map((m) => [m.material.name, bodyInside(root, [m], false)]).filter(([, x]) => x > 0).map(([n, x]) => `${n}:${(100 * x).toFixed(1)}`).join(' ')}]`; worstAt = actorAt(R, r.id); }
        }
        for (const p of R.props.current()) {
          if (p.prop === 'printer_wrecked') continue;
          const v = bodyInside(root, meshes(p.obj), false);
          if (v > worst) { worst = v; worstWho = `${r.id} (${pm.phase}) in ${p.prop}`; worstAt = actorAt(R, r.id); }
        }
        // The chin: the head is the top 45% of a character.
        if (k < 2 && (pm.phase === 'lift' || pm.phase === 'carry') && pm.obj.visible) {
          box.setFromObject(root);
          const gap = box.min.y + (box.max.y - box.min.y) * 0.55 - pbox.max.y;
          if (gap < chin) { chin = gap; chinWho = `${r.id} (${pm.phase})`; }
        }
      });
    }
    S.office.props = S.office.props.filter((p) => p.id !== 'wreck_prop');
    removeEventListener('hitl:moment', onHit);
    removeEventListener('hitl:spotlight', onSpot);
    const done = ['carry', 'down', 'smash', 'off'].every((x) => phases.has(x));
    const hitsOk = hits.join() === '0,1,2,3';
    const spotOk = spotSeen && spots.length === 2 && spots[0].active && !spots[1].active && spots[0].key === spots[1].key && spots[0].kind === 'printer_jam' && !R.spotlight();
    results.push({ name: 'moment:printer', pass: done && worst < 0.01 && chin > 0 && hitsOk && spotOk && quiet === true, phases: [...phases], hits, quiet, spotlight: { seen: spotSeen, events: spots.map((x) => `${x.active ? 'start' : 'end'} ${x.kind}`) }, samples, insidePct: +(100 * worst).toFixed(2), worstWho, worstAt, chinGap: +chin.toFixed(3), chinWho });
    R.moments.full = false;
    step(30);
  }
  // 7. The visitor chair (first user test) in the current office: the founders crouch out of sight
  // and one goes to the visitor's shoulder, clear of furniture and props the whole way.
  {
    R.moments.full = true;
    const desk = [...R.office.placed.values()].find((e) => e.desk);
    for (const choice of [0, 1]) {
      S.pendingDecision = { eventId: 'first_user_test', subjectId: ids[0], stage: { prop: 'visitor_chair', anchor: 'subjectDesk', x: desk.x, y: desk.y } };
      let worst = 0, worstWho = null, worstAt = null, samples = 0;
      const beats = new Set();
      for (let i = 0; i < 30 * 16; i++) {
        if (i === 30 * 8) { S.pendingDecision = null; R.handleEvents([{ type: 'decisionResolved', eventId: 'first_user_test', choice, subjectId: ids[0] }], S); }
        step(1);
        if (i % 3) continue;
        for (const [id, what] of R.moments.active) {
          if (what !== 'visitor') continue;
          samples++;
          beats.add(R.moments.staging(id)?.beat);
          const root = charOf(R.scene, id);
          const own = new Set([R.perks.peek(id)?.seat]);
          for (const e of R.office.placed.values()) {
            if (own.has(e.id)) continue;
            const v = bodyInside(root, meshes(e.obj), false);
            if (v > worst) { worst = v; worstWho = `${id} (${R.moments.staging(id)?.beat}) in ${e.itemId}:${e.id} at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)} t ${i} path ${JSON.stringify(R.perks.peek(id)?.path)} goal ${JSON.stringify(R.perks.peek(id)?.temp?.goal)} seat ${R.perks.peek(id)?.seat} vseat ${JSON.stringify(R.moments.visitorState?.seat)} desk ${desk.id}`; worstAt = actorAt(R, id); }
          }
          for (const p of R.props.current()) {
            if (!p.obj.visible) continue;
            const v = bodyInside(root, meshes(p.obj), false);
            if (v > worst) { worst = v; worstWho = `${id} (${R.moments.staging(id)?.beat}) in ${p.prop} at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)}; prop at ${p.obj.position.x.toFixed(2)},${p.obj.position.z.toFixed(2)}; path ${JSON.stringify(R.perks.peek(id)?.path)}; t ${i}`; worstAt = actorAt(R, id); }
          }
        }
      }
      const want = choice === 0 ? 'flinch' : 'explain';
      results.push({ name: `moment:visitor:${want}`, pass: samples > 0 && beats.has('hide') && beats.has(want) && worst < 0.01, samples, beats: [...beats], insidePct: +(100 * worst).toFixed(2), worstWho, worstAt });
      step(30 * 8);
    }
    R.moments.full = false;
  }
  // 8. Behind a decision card: the game freezes the office while a decision is open (main.js calls
  // setPaused), and the moment the decision stages still plays through it; everyone else holds
  // still. Paused outright (speed 0), the moment holds still too. Stepped through render(), which
  // is where the freeze applies.
  {
    R.moments.full = true;
    const frame = (n) => { for (let i = 0; i < n; i++) { R.sync(S); R.render(1 / 30); } };
    // A desk whose sitter is at it (seated, not off on a hard problem).
    frame(30 * 3);
    const occupied = [...R.office.placed.values()].find((e) => e.desk && S.staff.some((p) => R.perks.peek(p.id)?.seat === e.id && p.mood !== 'away' && p.assignment?.type !== 'hardProblem' && R.isSeated(p.id)));
    const sitter = S.staff.find((p) => R.perks.peek(p.id)?.seat === occupied?.id);
    S.pendingDecision = { eventId: 'resignation_letter', subjectId: sitter?.id, stage: { prop: 'envelope', anchor: 'subjectDesk', x: occupied?.x, y: occupied?.y } };
    R.setPaused(true);
    const where = () => new Map([...S.staff].map((p) => { const root = charOf(R.scene, p.id); return [p.id, root ? root.position.clone() : null]; }));
    frame(1);
    const before = where();
    // The letter's poses seen (readpaper is the read beat).
    const actors = new Set(), beats = new Set();
    for (let i = 0; i < 30 * 14; i++) {
      frame(1);
      for (const [id, what] of R.moments.active) if (what === 'letter') { actors.add(id); beats.add(R.perks.peek(id)?.temp?.anim); }
    }
    const after = where();
    const moved = [...before].filter(([id, p]) => p && after.get(id) && p.distanceTo(after.get(id)) > 0.01).map(([id]) => id);
    const strays = moved.filter((id) => !actors.has(id));
    // Paused outright: whoever is in the moment holds still.
    R.setSpeed(0);
    const held = where();
    frame(60);
    const late = where();
    const drift = [...actors].filter((id) => held.get(id) && held.get(id).distanceTo(late.get(id)) > 0.001);
    R.setSpeed(1);
    R.setPaused(false);
    S.pendingDecision = null;
    frame(30 * 4);
    results.push({ name: 'moment:behind-card', pass: actors.size > 0 && beats.has('readpaper') && strays.length === 0 && drift.length === 0, desk: occupied?.id ?? null, sitter: sitter?.id ?? null, actors: [...actors], beats: [...beats], strays, drift });
    R.moments.full = false;
  }
  // 9. A Yak prompt that delivers an event stages it as a card would, without pausing anything: the
  // prop is drawn and its moment plays while the prompt is open (the fumes get fanned), and
  // answering it (chatPromptResolved) acts on the choice (the walls-down swing).
  {
    R.moments.full = true;
    const prompt = (id, kind, stage) => ({ id, kind, chatId: null, channel: 'general', fromId: null, week: S.week, expiresWeek: S.week + 4, options: [], resolved: null, stage, subjectId: ids[0] });
    S.chatPrompts = [prompt('cp900', 'coffee_machine_broke', { prop: 'smoke_puff', anchor: 'kitchen', x: 1, y: 1 })];
    let drawn = false, fanned = false;
    for (let i = 0; i < 30 * 30 && !fanned; i++) {
      step(1);
      drawn ||= R.props.current().some((x) => x.prop === 'smoke_puff');
      fanned ||= R.moments.active.some(([, what]) => what === 'fumes');
    }
    S.chatPrompts = [prompt('cp901', 'open_plan_office', { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 })];
    // Answered once the hammer is up at the wall (or after 40 s), then given time to swing.
    const phases = new Set();
    let answeredAt = null;
    for (let i = 0; i < 30 * 60 && !phases.has('swing'); i++) {
      if (answeredAt === null && (R.moments.hammer?.phase === 'hold' || i === 30 * 40)) {
        answeredAt = i;
        S.chatPrompts[0].resolved = { choice: 0, week: S.week, replyId: null };
        R.handleEvents([{ type: 'chatPromptResolved', promptId: 'cp901', choice: 0 }], S);
      }
      step(1);
      if (R.moments.hammer) phases.add(R.moments.hammer.phase);
    }
    // The swing is a spotlight, and Skip (endSpotlight) cuts it short cleanly.
    const swingSpot = R.spotlight?.()?.kind ?? null;
    const skipped = R.endSpotlight?.() === true && !R.moments.hammer && !R.spotlight();
    S.chatPrompts = [];
    results.push({ name: 'moment:prompt-stage', pass: drawn && fanned && phases.has('swing') && swingSpot === 'open_plan_office' && skipped, drawn, fanned, phases: [...phases], swingSpot, skipped });
    R.moments.full = false;
    step(30 * 4);
  }
  // 10. A desk-staged prop names whose desk it is (stage.staffId): it goes on that person's desk even
  // when the anchor tile points at another one.
  {
    // The mock's staff have no deskId: two of them get the desks they sit at.
    const withDesk = S.staff.filter((p) => R.perks.peek(p.id)?.seat && R.office.placed.get(R.perks.peek(p.id).seat));
    const [a, b] = withDesk;
    const saved = [a, b].map((p) => p && [p, p.deskId]);
    for (const p of [a, b]) if (p) p.deskId = R.perks.peek(p.id).seat;
    let onTheirs = false;
    if (a && b) {
      const other = R.office.placed.get(a.deskId);
      S.pendingDecision = { eventId: 'resignation_letter', subjectId: b.id, stage: { prop: 'envelope', anchor: 'subjectDesk', x: other.x, y: other.y, staffId: b.id } };
      step(10);
      const env = R.props.current().find((x) => x.prop === 'envelope');
      onTheirs = env?.obj.userData.follow?.deskId === b.deskId && env?.staffId === b.id;
      S.pendingDecision = null;
      step(30 * 3);
    }
    for (const x of saved) if (x) { if (x[1] === undefined) delete x[0].deskId; else x[0].deskId = x[1]; }
    results.push({ name: 'prop:stageStaff', pass: onTheirs, staffId: b?.id ?? null, desk: b ? R.perks.peek(b.id)?.seat ?? null : null });
  }
  // 12. The letter's named reader is always castable under the decision freeze: caught in a
  // standup, a party pose or mid-walk, they go to their seat and read it (#704).
  {
    R.moments.full = true;
    const frame = (n) => { for (let i = 0; i < n; i++) { R.sync(S); R.render(1 / 30); } };
    frame(30 * 2);
    const cases = {};
    for (const [name, catchThem] of [
      ['standup', (id) => R.catchFor(id, { anim: 'idle', t: Infinity, standup: true }, { walk: true })],
      ['party', (id) => R.catchFor(id, { anim: 'celebrate', t: 1.8, keepPos: true }, { walk: false })],
      ['walking', (id) => R.catchFor(id, null, { walk: true })],
    ]) {
      const who = S.staff.find((p) => R.perks.peek(p.id)?.seat && R.isSeated(p.id) && p.mood !== 'away' && !R.walkOf(p.id)?.temp?.moment);
      if (!who) { cases[name] = { id: null, read: false }; continue; }
      const deskId = R.perks.peek(who.id).seat, d = R.office.placed.get(deskId);
      catchThem(who.id);
      S.pendingDecision = { eventId: 'hearing_summons', subjectId: who.id, stage: { prop: 'envelope', anchor: 'subjectDesk', x: d.x, y: d.y, staffId: who.id } };
      R.setPaused(true);
      let read = false;
      for (let i = 0; i < 30 * 25 && !read; i++) { frame(1); read = R.perks.peek(who.id)?.temp?.anim === 'readpaper'; }
      R.setPaused(false);
      S.pendingDecision = null;
      frame(30 * 8);
      cases[name] = { id: who.id, read };
    }
    results.push({ name: 'moment:letter-claim', pass: Object.values(cases).every((c) => c.read), ...cases });
    const lifecycle = {};
    const waitFor = (test, frames = 900) => { for (let i = 0; i < frames; i++) { frame(1); if (test()) return true; } return false; };
    for (const name of ['cancel', 'low', 'away', 'away-read', 'cancel-away', 'fallback']) {
      R.moments.full = name !== 'low';
      const who = S.staff.find((p) => R.perks.peek(p.id)?.seat && p.mood !== 'away' && !R.walkOf(p.id)?.temp?.moment);
      if (!who) { lifecycle[name] = { pass: false, why: 'no reader' }; continue; }
      const mood = who.mood, desk = R.office.placed.get(R.perks.peek(who.id).seat);
      R.catchFor(who.id, { anim: 'idle', t: Infinity, standup: true }, { walk: true });
      S.pendingDecision = { eventId: 'hearing_summons', subjectId: who.id, stage: { prop: 'envelope', anchor: 'subjectDesk', x: desk.x, y: desk.y, staffId: who.id } };
      R.setPaused(true);
      const claimed = waitFor(() => R.moments.staging(who.id)?.moment === 'letter');
      const nav = R.office.nav(), blocked = nav.isBlocked;
      let fallback = false, read = false, slump = false, returned = false, released = false, hidden = false;
      try {
        if (name === 'fallback') {
          nav.isBlocked = (x, z, radius) => radius != null || blocked(x, z, radius);
          read = waitFor(() => R.moments.staging(who.id)?.beat === 'read');
          fallback = R.trace.lines(200).some((x) => x.id === who.id && x.what === 'fallback');
          nav.isBlocked = blocked;
          slump = waitFor(() => R.moments.staging(who.id)?.beat === 'slump');
          returned = waitFor(() => !R.walkOf(who.id)?.temp?.moment && !R.walkOf(who.id)?.path.length && R.isSeated(who.id));
        } else {
          if (name.startsWith('cancel')) S.pendingDecision = null;
          if (name === 'away-read') read = waitFor(() => R.moments.staging(who.id)?.beat === 'read');
          if (name === 'away' || name === 'away-read') who.mood = 'away';
          released = waitFor(() => R.walkOf(who.id)?.temp?.moment !== 'letter');
          if (name === 'low') {
            for (let i = 0; i < 900; i++) {
              frame(1);
              released &&= !R.walkOf(who.id)?.temp?.moment && !R.walkOf(who.id)?.path.length;
            }
          }
          if (name === 'cancel-away') who.mood = 'away';
          if (name.includes('away')) { R.setPaused(false); hidden = waitFor(() => R.walkOf(who.id)?.hidden); }
        }
      } finally {
        nav.isBlocked = blocked;
        S.pendingDecision = null;
        who.mood = mood;
        R.setPaused(false);
        frame(30 * 12);
      }
      const pass = claimed && (name === 'fallback' ? fallback && read && slump && returned : released && (!name.includes('away') || hidden) && (name !== 'away-read' || read));
      lifecycle[name] = { pass, claimed, released, hidden, fallback, read, slump, returned };
    }
    results.push({ name: 'moment:letter-lifecycle', pass: Object.values(lifecycle).every((c) => c.pass), ...lifecycle });
    R.moments.full = false;
  }
  R.perks.hold = false;
  return results;
}

// Pair perks in a small office: a foosball table on a free tile with room round it. The start rules
// must allow a pair game there (perks.pairReady) within a minute of settling, and two people sent to
// the table must get as far as playing. Random visits are held off, so nothing depends on a pick.
export async function runPairCheck(R, S, label, { dt = 1 / 30 } = {}) {
  const { footprint } = await import('./layout.js');
  const L = R.office.current.L;
  const used = new Set();
  const mark = (p) => { const f = footprint(p.itemId, p.rot ?? 0); for (let x = 0; x < f.w; x++) for (let y = 0; y < f.h; y++) used.add(`${p.x + x},${p.y + y}`); };
  S.office.placed.forEach(mark);
  for (const [x, y] of L.blocked) used.add(`${x},${y}`);
  const f = footprint('foosball', 0);
  let spot = null;
  for (let y = 2; y < L.grid.h - f.h - 1 && !spot; y++) for (let x = 1; x < L.grid.w - f.w - 1 && !spot; x++) {
    let ok = true;
    for (let i = -1; i <= f.w && ok; i++) for (let j = -1; j <= f.h && ok; j++) if (used.has(`${x + i},${y + j}`)) ok = false;
    if (ok) spot = { x, y };
  }
  if (!spot) return { name: `pairs:${label}`, pass: false, why: 'no free tile for the table' };
  S.office.placed.push({ id: 'pair_table', itemId: 'foosball', level: 1, ...spot, rot: 0 });
  const step = (n) => { for (let i = 0; i < n; i++) { R.sync(S); R.advance(dt); } };
  R.perks.hold = true;
  let readyAt = null;
  for (let t = 0; t < 60 && readyAt === null; t += dt * 5) { step(5); if (R.perks.pairReady(S)) readyAt = +t.toFixed(1); }
  const ids = S.staff.filter((p) => p.mood !== 'away' && !p.remote).slice(0, 2).map((p) => p.id);
  const before = R.perks.played;
  R.perks.send(ids, 'pair_table', { dur: 6 });
  let playedAt = null;
  for (let t = 0; t < 30 && playedAt === null; t += dt * 5) { step(5); if (R.perks.played > before) playedAt = +t.toFixed(1); }
  // The game on the table: the ball travels and stays on the pitch, and the rods turn.
  const obj = R.office.placed.get('pair_table')?.obj;
  const rods = [0, 1, 2, 3].map((i) => obj?.getObjectByName(`foosball_rod${i}`));
  let travel = 0, off = 0, turn = 0, prev = null;
  for (let i = 0; i < 30 * 5 && playedAt !== null; i++) {
    step(1);
    const ball = rods[0]?.parent.children.map((c) => c.children.find((b) => b.isMesh && b.geometry.type === 'SphereGeometry')).find(Boolean);
    if (!ball) continue;
    if (prev) travel += Math.hypot(ball.position.x - prev.x, ball.position.z - prev.z);
    prev = ball.position.clone();
    if (Math.abs(ball.position.x) > 0.43 || Math.abs(ball.position.z) > 0.24) off++;
    turn = Math.max(turn, ...rods.map((r) => (r ? 2 * Math.acos(Math.min(1, Math.abs(r.quaternion.dot(r.userData.q0 ??= r.quaternion.clone())))) : 0)));
  }
  S.office.placed = S.office.placed.filter((p) => p.id !== 'pair_table');
  step(60);
  // A new toy: the same table placed live (visits not held) draws two people as soon as two are free
  // (at once in a full office; a two-person garage waits for them to get back from the last game).
  R.perks.hold = false;
  S.office.placed.push({ id: 'new_table', itemId: 'foosball', level: 1, ...spot, rot: 0 });
  let newToy = null;
  for (let t = 0; t < 12 && newToy === null; t += dt) { step(1); if (R.perks.sessions > 0) newToy = +t.toFixed(2); }
  S.office.placed = S.office.placed.filter((p) => p.id !== 'new_table');
  step(60);
  R.perks.hold = true;
  const game = travel > 1 && off === 0 && turn > 0.3 && newToy !== null;
  return { name: `pairs:${label}`, pass: readyAt !== null && playedAt !== null && game, staff: S.staff.length, readyAt, playedAt, table: spot, ballTravel: +travel.toFixed(2), offPitch: off, rodTurn: +turn.toFixed(2), newToyAt: newToy };
}

// The sky backdrop redraws at most a few times a second; a change inside that window must still be
// drawn when it ends, so the sky settles on the last time of day asked for even if time then stops.
export async function runSkyCheck() {
  const { createBackdrop } = await import('./lighting.js');
  const b = createBackdrop();
  const px = () => [...b.texture.image.getContext('2d').getImageData(128, 20, 1, 1).data].slice(0, 3);
  b.update({ daylight: 1, dusk: 0 });
  const day = px();
  b.update({ daylight: 0.5, dusk: 1 });
  b.update({ daylight: 0, dusk: 0 });
  await new Promise((r) => setTimeout(r, 400));
  window.__tick?.(400);
  const last = px();
  const fresh = createBackdrop();
  fresh.update({ daylight: 0, dusk: 0 });
  const night = [...fresh.texture.image.getContext('2d').getImageData(128, 20, 1, 1).data].slice(0, 3);
  return { name: 'sky:trailing', pass: last.join() === night.join() && day.join() !== night.join(), day: day.join(), last: last.join(), night: night.join() };
}

// A passer on open floor beside an idle pet. Only the fixture positions actors; the
// production greeting must notice the walker and release them back to their goal.
export function setupPetPasser(R, S, species = 'dog') {
  R.perks.hold = true;
  S.pendingDecision = null;
  S.pets = [{ id: 'check_pet', species, name: 'Kernel', ownerId: null }];
  R.sync(S);
  const nav = R.office.nav(), L = R.office.current.L;
  let at = null;
  for (let z = 0; z < L.D / 2 - 1 && !at; z += 0.5) for (let x = L.W / 2 - 1.5; x > 0; x -= 0.5) {
    if ([-0.8, 0, 0.8].every(dx => [-0.8, 0, 0.8].every(dz => !nav.isBlocked(x + dx, z + dz)))) { at = { x, z }; break; }
  }
  if (!at) throw new Error('pet fixture needs open floor');
  const id = S.staff.find(s => s.mood !== 'away' && !s.remote).id;
  R.standAt(id, at.x, at.z);
  R.catchFor(id, null, { walk: true });
  window.__advance(1);
  const pos = charOf(R.scene, id).position;
  R.pets.standAt('check_pet', pos.x, pos.z + 0.65);
  return { id, at };
}

export async function runPetChecks(R, S) {
  const results = [];
  for (const species of ['dog', 'cat']) {
    R.pets.reset(); R.setQuality('medium');
    const { id } = setupPetPasser(R, S, species);
    const root = charOf(R.scene, id);
    let samples = 0, worst = 0, petInside = 0, resumed = false;
    let petRoot = null; R.scene.traverse(o => { if (o.name === 'pet') petRoot = o; });
    for (let f = 0; f < 160; f++) {
      window.__advance(1);
      if (R.walkOf(id)?.temp?.moment === 'pet') {
        samples++;
        if (f % 3 === 0) {
          worst = Math.max(worst, bodyInside(root, furnitureOf(R)));
          petInside = Math.max(petInside, bodyInside(root, meshes(petRoot), false));
        }
      } else if (samples && R.walkOf(id)?.path.length) resumed = true;
    }
    results.push({ name: `moment:pet:${species}`, pass: samples >= 80 && resumed && worst < 0.01 && petInside < 0.01, samples, resumed, petInsidePct: +(petInside * 100).toFixed(2), insidePct: +(worst * 100).toFixed(2) });
  }
  for (const interrupt of ['remove', 'away', 'priority', 'decision', 'low']) {
    R.pets.reset(); R.setQuality('medium');
    const { id } = setupPetPasser(R, S);
    for (let f = 0; f < 30 && !R.pets.peek('check_pet')?.petter; f++) window.__advance(1);
    const started = R.pets.peek('check_pet')?.petter === id;
    const staff = S.staff.find(s => s.id === id), mood = staff.mood;
    if (interrupt === 'remove') S.pets = [];
    if (interrupt === 'away') staff.mood = 'away';
    if (interrupt === 'priority') R.catchFor(id, { anim: 'celebrate', t: 10, keepPos: true });
    if (interrupt === 'decision') S.pendingDecision = { eventId: 'pet_check', choices: [] };
    if (interrupt === 'low') R.setQuality('low');
    window.__advance(3);
    const ended = !R.pets.peek('check_pet')?.petter && R.walkOf(id)?.temp?.moment !== 'pet';
    const priority = interrupt !== 'priority' || R.walkOf(id)?.temp?.anim === 'celebrate';
    results.push({ name: `moment:pet:${interrupt}`, pass: started && ended && priority, started, ended, priority });
    staff.mood = mood; S.pendingDecision = null;
  }
  for (const blocked of ['busy', 'stationary', 'distant']) {
    R.pets.reset(); R.setQuality('medium');
    const { id, at } = setupPetPasser(R, S);
    if (blocked === 'busy') R.catchFor(id, { anim: 'idle', t: 5, moment: 'other' });
    if (blocked === 'stationary') { R.standAt(id, at.x, at.z); R.catchFor(id, null); }
    if (blocked === 'distant') R.pets.standAt('check_pet', at.x - 3, at.z + 2);
    window.__advance(1);
    results.push({ name: `moment:pet:skip-${blocked}`, pass: !R.pets.peek('check_pet')?.petter });
  }
  R.pets.reset(); R.setQuality('low');
  const { id } = setupPetPasser(R, S);
  window.__advance(20);
  const skipped = !R.pets.peek('check_pet')?.petter && R.walkOf(id)?.temp?.moment !== 'pet';
  results.push({ name: 'moment:pet:low-skip', pass: skipped });
  S.pets = []; R.sync(S);
  return results;
}
