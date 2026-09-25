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
    let worst = 0, worstWho = null, samples = 0;
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
          if (v > worst) { worst = v; worstWho = `${id} in ${e.itemId}:${e.id} (${pk.temp?.key ?? 'goal'}) at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)} own ${deskOf(id)} item at ${e.target.x.toFixed(2)},${e.target.z.toFixed(2)} path ${pk.path}`; }
        }
      }
    }
    R.perks.hold = true;
    results.push({ name: 'walk:walkers', pass: worst < 0.01 && samples > 20, worstInsidePct: +(100 * worst).toFixed(2), worstWho, samples });
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
    let worst = 0, worstWho = null;
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
          if (v > worst) { worst = v; worstWho = `${id} in ${e.itemId}:${e.id} at ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)}`; }
        }
        for (const p of R.props.current()) {
          if (p.prop === 'pizza_boxes') continue;
          const v = bodyInside(root, meshes(p.obj), false);
          if (v > worst) { worst = v; worstWho = `${id} in ${p.prop}`; }
        }
      }
    }
    results.push({ name: 'moment:pizza', pass: eaters.size > 0 && worst < 0.01, eaters: eaters.size, insidePct: +(100 * worst).toFixed(2), worstWho });
    S.office.props = S.office.props.filter((p) => p.id !== 'pizza_prop');
    R.moments.full = false;
    step(10);
  }
  // 4. The sledgehammer: whoever fetches it and carries it to the wall stays clear of furniture and
  // props, and the walls-down choice (decisionResolved) ends in a swing.
  {
    R.moments.full = true;
    S.pendingDecision = { eventId: 'open_plan_office', subjectId: ids[0], stage: { prop: 'sledgehammer', anchor: 'wall', x: 4, y: 0 } };
    let worst = 0, worstWho = null, phases = new Set();
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
        if (v > worst) { worst = v; worstWho = `${h.id} (${h.phase}) in ${e.itemId}:${e.id}`; }
      }
    }
    results.push({ name: 'moment:hammer', pass: phases.has('hold') && phases.has('swing') && worst < 0.01, phases: [...phases], insidePct: +(100 * worst).toFixed(2), worstWho });
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
    let worst = 0, worstWho = null, stood = 0;
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
              worstWho = `${id} in ${e.itemId}:${e.id} [${parts.join(' ')}] path ${R.perks.peek(id)?.path}`;
            }
          }
        }
      }
      S.office.props = S.office.props.filter((p) => p.id !== 'letter_prop');
      step(30);
    }
    results.push({ name: 'moment:letter', pass: stood > 0 && worst < 0.01, desks: occupied.length, samples: stood, insidePct: +(100 * worst).toFixed(2), worstWho });
    R.moments.full = false;
  }
  // 6. The printer taken out back (printer_jam, choice 0): the carriers, the one with the bat and the
  // printer itself stay clear of furniture and props from the lift to the walk-off, and the printer is
  // carried low, its top under each carrier's chin.
  {
    R.moments.full = true;
    S.pendingDecision = { eventId: 'printer_jam', subjectId: ids[0], stage: { prop: 'printer_jammed', anchor: 'kitchen', x: 1, y: 1 } };
    step(30);
    S.pendingDecision = null;
    S.office.props.push({ id: 'wreck_prop', prop: 'printer_wrecked', x: 1, y: 1, since: S.week, until: { weeks: 2 } });
    R.handleEvents([{ type: 'decisionResolved', eventId: 'printer_jam', choice: 0, subjectId: ids[0] }], S);
    let worst = 0, worstWho = null, samples = 0, chin = Infinity, chinWho = null;
    const phases = new Set();
    const box = new THREE.Box3(), pbox = new THREE.Box3();
    for (let i = 0; i < 30 * 30; i++) {
      step(1);
      const pm = R.moments.printerState;
      if (!pm) { if (phases.size) break; continue; }
      phases.add(pm.phase);
      if (i % 2 || pm.phase === 'off') continue;
      samples++;
      pbox.setFromObject(pm.obj);
      pm.people.forEach((r, k) => {
        const root = charOf(R.scene, r.id);
        const own = new Set([R.perks.peek(r.id)?.seat]);
        for (const e of R.office.placed.values()) {
          if (own.has(e.id)) continue;
          const v = bodyInside(root, meshes(e.obj), false);
          if (v > worst) { worst = v; const ms = meshes(e.obj); worstWho = `${r.id} (${pm.phase} at ${pm.s.toFixed(2)} of ${pm.len.toFixed(2)} m, twist ${pm.twists?.[Math.round(pm.s / 0.1)]?.toFixed(2)}, clear ${pm.clear}, pos ${root.position.x.toFixed(2)},${root.position.z.toFixed(2)}) in ${e.itemId}:${e.id} [${ms.map((m) => [m.material.name, bodyInside(root, [m], false)]).filter(([, x]) => x > 0).map(([n, x]) => `${n}:${(100 * x).toFixed(1)}`).join(' ')}]`; }
        }
        for (const p of R.props.current()) {
          if (p.prop === 'printer_wrecked') continue;
          const v = bodyInside(root, meshes(p.obj), false);
          if (v > worst) { worst = v; worstWho = `${r.id} (${pm.phase}) in ${p.prop}`; }
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
    const done = ['carry', 'down', 'smash', 'off'].every((x) => phases.has(x));
    results.push({ name: 'moment:printer', pass: done && worst < 0.01 && chin > 0, phases: [...phases], samples, insidePct: +(100 * worst).toFixed(2), worstWho, chinGap: +chin.toFixed(3), chinWho });
    R.moments.full = false;
    step(30);
  }
  R.perks.hold = false;
  return results;
}
