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
    for (let i = 0; i < 400 && R.perks.peek(who)?.path; i++) R.advance(0.1);
    for (let i = 0; i < settle; i++) R.advance(dt);
    const e = R.office.placed.get(id);
    const root = charOf(R.scene, who);
    const furniture = meshes(e.obj);
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
    const pass = headPct < 1 && gap < FLOAT_MAX && (soft ? sunk > SOFT_SINK : pct < 2);
    results.push({ name: label, anim: R.perks.peek(who)?.temp?.anim, pass, insidePct: +pct.toFixed(2), headInsidePct: +headPct.toFixed(2),
      floatGap: +gap.toFixed(3), ...(soft ? { sunkBelowTop: +sunk.toFixed(2) } : {}) });
  }
  return { pass: results.every((r) => r.pass), results };
}
