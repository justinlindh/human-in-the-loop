// In-page measurements for the scene integrity sweep (sweep.mjs), on the live renderer.
//
//   bodies(R)            every solid thing in the office as { key, kind, label, obj, meshes }
//   overlaps(bodies)     pairs that interpenetrate, with the depth and a witness point
//   support(R, bodies)   things that should rest on something: the gap to what is under them
//   held(R)              props in a hand: the gap from the wrist to the prop
//   bounds(R, bodies)    things outside the room or below the floor
//   carried(R)           what each person holds or carries, with their own head and torso
//   screen(R)            on-screen rectangles (client px) of speech bubbles, stat labels, emotes
//                        and faces, for the screen-space overlap check
//   people(R)            every character as a body, with what they may touch (their own desk,
//                        the item they are using or leaving, the desk of a moment they are in)
//
// Depths come from accurate mesh tests (three-mesh-bvh): the triangle meshes are checked for
// crossing, then points of each mesh found inside the other (both an upward and a downward ray
// cross the other an odd number of times) give the depth as their distance to its surface.
// Measurement only: nothing here changes the scene, state or geometry (the BVHs are indirect).
import * as THREE from 'three';
import { MeshBVH } from '/node_modules/three-mesh-bvh/src/index.js';

const MAX_POINTS = 1500;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const bvhs = new WeakMap();
function bvhOf(geo) {
  let b = bvhs.get(geo);
  if (!b) { b = new MeshBVH(geo, { indirect: true, maxLeafSize: 8 }); bvhs.set(geo, b); }
  return b;
}

// Meshes that are solid: not sprites, lines, pick proxies, glows or puffs.
function solidMeshes(obj) {
  const out = [];
  obj.traverse((o) => {
    if (!o.isMesh || o.isSprite || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
    if (o.userData.staffId !== undefined) return;
    // A window sill hidden behind tall furniture (office.js) is not there.
    if (o.userData.sill && !o.visible) return;
    // Nor is a staged prop the renderer has hidden (the spare chair a visitor does not use). Batched
    // furniture hides its own meshes too, so only a hidden prop counts, not any hidden mesh.
    for (let x = o; x; x = x.parent) if (x.userData.propId && !x.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m && (m.transparent && m.opacity < 0.6 || m.depthWrite === false || m.blending === THREE.AdditiveBlending)) return;
    out.push(o);
  });
  return out;
}

// A prop's kind from how props.js built it.
function propKind(obj) {
  const u = obj.userData;
  if (u.span) return 'wallProp';
  if (u.follow) return u.follow.y > 0 ? 'deskProp' : 'floorProp';
  if (u.blocks) return 'floorProp';
  return 'fxProp';
}

// Every solid body now in the office. Items still popping in, sliding, or shrinking away are left
// out: they are mid-animation, not placed.
export function bodies(R) {
  const out = [];
  const cur = R.office?.current;
  if (!cur) return out;
  for (const e of R.office.placed.values()) {
    if (e.sliding || Math.abs(e.obj.scale.x - 1) > 1e-3 || !e.obj.parent) continue;
    out.push({ key: `placed:${e.id}`, kind: 'placed', label: e.itemId, id: e.id, obj: e.obj, meshes: solidMeshes(e.obj), wallMounted: /_wall$|^whiteboard_wall$/.test(e.itemId) });
  }
  for (const p of R.props?.current() ?? []) {
    const kind = propKind(p.obj);
    if (kind === 'fxProp' || Math.abs(p.obj.scale.x - 1) > 1e-3) continue;
    out.push({ key: `prop:${p.prop}`, kind, label: p.prop, obj: p.obj, meshes: solidMeshes(p.obj), deskId: p.obj.userData.follow?.deskId ?? null });
  }
  for (const [k, w] of Object.entries(cur.walls ?? {})) out.push({ key: `wall:${k}`, kind: 'wall', label: `wall_${k}`, obj: w, meshes: solidMeshes(w) });
  if (cur.columnSet?.group) out.push({ key: 'columns', kind: 'column', label: 'columns', obj: cur.columnSet.group, meshes: solidMeshes(cur.columnSet.group) });
  for (const b of out) {
    b.obj.updateMatrixWorld(true);
    b.box = new THREE.Box3();
    for (const m of b.meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      b.box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
  }
  return out.filter((b) => b.meshes.length && !b.box.isEmpty());
}

// Body parts tested against the world: head and torso always, legs while walking. Arms swing past
// edges and legs belong in chairs and on cushions, so neither counts while seated or resting.
const PARTS_STILL = new Set(['head', 'torso']);
const PARTS_WALKING = new Set(['head', 'torso', 'legL', 'legR']);

export function people(R, world = []) {
  const out = [];
  const moment = new Map(R.moments?.active ?? []);
  const momentDesks = world.filter((b) => b.deskId).map((b) => b.deskId);
  R.scene.traverse((o) => {
    if (o.name !== 'character' || !o.visible) return;
    let id = null;
    o.traverse((c) => { if (c.userData.staffId !== undefined) id = c.userData.staffId; });
    if (id == null || !o.parent) return;
    const root = o;
    const pk = R.perks?.peek(id);
    const walking = !!pk?.path;
    const parts = walking ? PARTS_WALKING : PARTS_STILL;
    const meshes = [];
    root.traverse((c) => { if (c.isMesh && parts.has(c.userData.part)) meshes.push(c); });
    if (!meshes.length) return;
    const own = new Set([pk?.seat, pk?.exitFrom, pk?.temp?.key?.split(':')[0]].filter(Boolean).map((x) => `placed:${x}`));
    if (moment.has(id)) for (const d of momentDesks) own.add(`placed:${d}`);
    const b = { key: `staff:${id}`, kind: 'person', label: 'person', id, obj: root, meshes, own, walking, anim: pk?.temp?.anim ?? null, moment: moment.get(id) ?? null };
    root.updateMatrixWorld(true);
    b.box = new THREE.Box3();
    for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
    out.push(b);
  });
  return out;
}

// What each person holds or carries, and the parts of their own body it must stay out of. A held
// thing is anything attached to the body that is not a body part: a child of a wrist (a mug, a
// slice, a hammer) or a mesh hung on a pivot beside a baked part (a carried box against the torso).
// A moment's held prop (moments.js staging) counts too. The body to test is the head and torso;
// the arms grip the thing and are left out.
export function carried(R) {
  const out = [];
  R.scene.traverse((o) => {
    if (o.name !== 'character' || !o.visible) return;
    let id = null;
    const parts = [], pivots = new Set();
    o.traverse((c) => {
      if (c.userData.staffId !== undefined) id = c.userData.staffId;
      if (c.isMesh && c.userData.part) { parts.push(c); pivots.add(c.parent); }
    });
    // A group with a body part somewhere under it is more body (a shoulder, a neck), not a hand.
    const hasPart = (g) => { let yes = false; g.traverse((c) => { if (c.userData.part) yes = true; }); return yes; };
    const things = new Set();
    for (const pv of pivots) {
      for (const c of pv.children) {
        if (c.userData.part || c.name === 'baked' || c.isSprite || c.userData.staffId !== undefined || !c.visible || hasPart(c)) continue;
        // A wrist (a group holding the hand's things) or a thing hung on the pivot itself.
        if (c.isMesh) things.add(c);
        else if (c.isGroup) for (const k of c.children) if (k.visible && !k.isSprite) things.add(k);
      }
    }
    // What a moment says they hold (moments.js staging): a prop it carries on their hands without
    // attaching it to the body, like a printer lifted overhead by two people.
    const st = id != null ? R.moments?.staging?.(id) : null;
    if (st?.held?.isObject3D && st.held.visible) things.add(st.held);
    const self = parts.filter((m) => m.userData.part === 'head' || m.userData.part === 'torso');
    if (!things.size || !self.length) return;
    o.updateMatrixWorld(true);
    const body = { key: `self:${id}`, kind: 'self', label: 'body', id, obj: o, meshes: self };
    body.box = boxOf(self);
    for (const t of things) {
      const meshes = solidMeshes(t);
      if (!meshes.length) continue;
      const label = t.name || (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material)?.name || 'held';
      out.push({ staffId: id, thing: { key: `held:${id}:${t.uuid}`, kind: 'held', label, obj: t, meshes, box: boxOf(meshes) }, body });
    }
  });
  return out;
}

function boxOf(meshes) {
  const b = new THREE.Box3();
  for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
  return b;
}

// Screen rectangles, in client pixels, of what is drawn over the scene now: speech bubbles and stat
// labels (the CSS2D layer, as laid out by the last render), emotes (sprites over heads) and faces
// (each person's head). Labels fading in or out (opacity under 0.6) are left out.
export function screen(R) {
  const canvas = document.querySelector('canvas');
  const cr = canvas.getBoundingClientRect();
  const out = { labels: [], emotes: [], faces: [] };
  for (const el of document.querySelectorAll('.hitl-lbl')) {
    if (el.style.display === 'none' || Number(el.style.opacity || 1) < 0.6 || !el.isConnected) continue;
    const inner = el.querySelector('.in') ?? el;
    const r = inner.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.labels.push({ kind: el.classList.contains('hitl-say') ? 'bubble' : el.classList.contains('hitl-stat') ? 'stat' : 'label', text: inner.textContent.slice(0, 40), r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
  }
  const cam = R.camera;
  const toScreen = (v) => { const p = v.clone().project(cam); return { x: cr.left + ((p.x + 1) / 2) * cr.width, y: cr.top + ((1 - p.y) / 2) * cr.height, on: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 }; };
  const rectOfPoints = (pts) => ({ left: Math.min(...pts.map((p) => p.x)), right: Math.max(...pts.map((p) => p.x)), top: Math.min(...pts.map((p) => p.y)), bottom: Math.max(...pts.map((p) => p.y)) });
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  R.scene.traverse((o) => {
    if (o.name !== 'character' || !o.visible) return;
    let id = null, head = null, emote = null;
    o.traverse((c) => {
      if (c.userData.staffId !== undefined) id = c.userData.staffId;
      if (c.userData.part === 'head') head = c;
      if (c.isSprite && c.visible && c.renderOrder === 10) emote = c;
    });
    if (head) {
      // The head as drawn: its projected vertices (a projected bounding box is far larger).
      const pos = head.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 300));
      const pts = [];
      for (let i = 0; i < pos.count; i += step) pts.push(toScreen(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(head.matrixWorld)));
      if (pts.some((p) => p.on)) out.faces.push({ id, r: rectOfPoints(pts) });
    }
    if (emote) {
      const c = new THREE.Vector3().setFromMatrixPosition(emote.matrixWorld);
      const s = new THREE.Vector3().setFromMatrixScale(emote.matrixWorld);
      // A sprite's quad, with its centre point (emote.center) at its world position.
      const x0 = -emote.center.x * s.x, x1 = (1 - emote.center.x) * s.x, y0 = -emote.center.y * s.y, y1 = (1 - emote.center.y) * s.y;
      const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([a, b2]) => toScreen(c.clone().addScaledVector(right, a).addScaledVector(up, b2)));
      if (pts.some((p) => p.on)) out.emotes.push({ id, r: rectOfPoints(pts) });
    }
  });
  return out;
}

// Overlap of two screen rectangles: the area, and that area as a share of the smaller one.
export function rectOverlap(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return { area: 0, share: 0 };
  const area = w * h;
  const small = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
  return { area, share: small > 0 ? area / small : 0 };
}

// World-space sample points of a mesh: its vertices, at most MAX_POINTS of them.
function points(mesh) {
  const pos = mesh.geometry.attributes.position;
  const step = Math.max(1, Math.ceil(pos.count / MAX_POINTS));
  const out = [];
  for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  return out;
}

const ray = new THREE.Ray();
// Hits along a ray, with near-coincident hits (a shared edge, a doubled face) counted once.
function crossings(bvh, origin, dir) {
  ray.set(origin, dir);
  const d = bvh.raycast(ray, THREE.DoubleSide).map((h) => h.distance).sort((a, b) => a - b);
  let n = 0, last = -1;
  for (const x of d) { if (x - last > 1e-4) n++; last = x; }
  return n;
}

// A mesh's body part or material name, to say which part of a model is involved. Screens and LEDs swap
// materials with what they show, so they go by what they are.
function partName(m) {
  if (m.userData.part) return m.userData.part;
  const n = (Array.isArray(m.material) ? m.material[0] : m.material)?.name || m.name || 'mesh';
  return /^screen/.test(n) ? 'screen' : /^glow_led/.test(n) ? 'led' : n;
}

function scaleOf(m) { return new THREE.Vector3().setFromMatrixScale(m.matrixWorld).x; }

// How far points of mesh a reach inside mesh b: the largest distance from a point of a inside b to
// b's surface, and that point.
function depthInto(a, b) {
  const bvh = bvhOf(b.geometry);
  const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
  const box = b.geometry.boundingBox;
  const s = scaleOf(b);
  let depth = 0, at = null;
  const local = new THREE.Vector3(), hit = {};
  for (const p of points(a)) {
    local.copy(p).applyMatrix4(inv);
    if (!box.containsPoint(local)) continue;
    if (crossings(bvh, local, UP) % 2 === 0 || crossings(bvh, local, DOWN) % 2 === 0) continue;
    const c = bvh.closestPointToPoint(local, hit);
    const d = (c?.distance ?? 0) * s;
    if (d > depth) { depth = d; at = p.clone(); }
  }
  return { depth, at };
}

// Whether two meshes' surfaces cross, or one sits wholly inside the other.
function touching(a, b) {
  const bvh = bvhOf(b.geometry);
  const m = new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(a.matrixWorld);
  if (bvh.intersectsGeometry(a.geometry, m)) return true;
  const inside = (x, y) => {
    const p = new THREE.Vector3().fromBufferAttribute(x.geometry.attributes.position, 0).applyMatrix4(x.matrixWorld).applyMatrix4(new THREE.Matrix4().copy(y.matrixWorld).invert());
    const by = bvhOf(y.geometry);
    return y.geometry.boundingBox.containsPoint(p) && crossings(by, p, UP) % 2 === 1 && crossings(by, p, DOWN) % 2 === 1;
  };
  return inside(a, b) || inside(b, a);
}

// Pairs across two lists (people against the world), with the same measure as overlaps().
export function crossOverlaps(as, bs, opts = {}) {
  const tag = new Set(as);
  return overlaps([...as, ...bs], { ...opts, skip: (A, B) => (tag.has(A) === tag.has(B)) || (opts.skip?.(A, B) ?? false) });
}

// Pairs of bodies that interpenetrate by more than `tol` metres. skip(a, b) leaves out pairs that
// are not to be compared at all (wall against wall).
export function overlaps(list, { tol = 0.01, skip = () => false } = {}) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    if (skip(A, B) || !A.box.intersectsBox(B.box)) continue;
    let depth = 0, at = null;
    const parts = [];
    for (const a of A.meshes) for (const b of B.meshes) {
      const ba = a.geometry.boundingBox.clone().applyMatrix4(a.matrixWorld), bb = b.geometry.boundingBox.clone().applyMatrix4(b.matrixWorld);
      if (!ba.intersectsBox(bb) || !touching(a, b)) continue;
      const d = Math.max(...[depthInto(a, b), depthInto(b, a)].map((r) => { if (r.depth > depth) { depth = r.depth; at = r.at; } return r.depth; }));
      if (d > tol) parts.push({ a: partName(a), b: partName(b), depth: d });
    }
    parts.sort((x, y) => y.depth - x.depth);
    if (depth > tol) out.push({ a: A, b: B, depth, at, parts });
  }
  return out;
}

// The gap under a body that should rest on something: from the lowest points of its meshes, a ray
// down to the nearest other body or the floor (y = 0). A body sunk into what it stands on shows up
// in overlaps() instead, so only a positive gap (floating) is reported here.
export function support(list, which) {
  const out = [];
  const solids = list.flatMap((b) => b.meshes.map((m) => ({ m, b })));
  for (const B of list.filter(which)) {
    const low = B.box.min.y;
    const feet = [];
    for (const m of B.meshes) for (const p of points(m)) if (p.y < low + 0.01) feet.push(p);
    let gap = low, under = 'floor';
    for (const p of feet) {
      for (const { m, b } of solids) {
        if (b === B || b.box.max.y > p.y + 0.02 && b.box.min.y > p.y) continue;
        if (p.x < b.box.min.x || p.x > b.box.max.x || p.z < b.box.min.z || p.z > b.box.max.z) continue;
        const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
        const o = p.clone().add(new THREE.Vector3(0, 0.02, 0)).applyMatrix4(inv);
        const dir = DOWN.clone().transformDirection(inv);
        ray.set(o, dir);
        const h = bvhOf(m.geometry).raycastFirst(ray, THREE.DoubleSide);
        if (!h) continue;
        const y = h.point.clone().applyMatrix4(m.matrixWorld).y;
        if (p.y - y < gap) { gap = p.y - y; under = b.label; }
      }
    }
    out.push({ b: B, gap: Math.max(0, gap), under, at: feet[0] ?? B.box.getCenter(new THREE.Vector3()) });
  }
  return out;
}

// Props in someone's hand: the gap from the wrist (where the hand is) to the prop's surface.
export function held(R) {
  const out = [];
  R.scene.traverse((o) => {
    if (o.name !== 'character') return;
    let armR = null;
    o.traverse((c) => { if (c.userData.part === 'armR') armR = c; });
    const wrist = armR?.parent?.children.find((c) => c.isGroup && c !== armR && c.children.length);
    if (!wrist) return;
    wrist.updateMatrixWorld(true);
    const w = new THREE.Vector3().setFromMatrixPosition(wrist.matrixWorld);
    for (const thing of wrist.children) {
      const ms = solidMeshes(thing);
      if (!ms.length) continue;
      let gap = Infinity;
      for (const m of ms) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const local = w.clone().applyMatrix4(new THREE.Matrix4().copy(m.matrixWorld).invert());
        const c = bvhOf(m.geometry).closestPointToPoint(local, {});
        if (c) gap = Math.min(gap, c.distance * scaleOf(m));
      }
      let staffId = null;
      o.traverse((c) => { if (c.userData.staffId !== undefined) staffId = c.userData.staffId; });
      out.push({ staffId, label: thing.name || ms[0].material?.name || 'held', gap, at: w });
    }
  });
  return out;
}

// Bodies outside the room: past the walls' inner faces or below the floor, by more than tol.
export function bounds(R, list, { tol = 0.02 } = {}) {
  const L = R.office.current.L;
  const out = [];
  for (const B of list) {
    if (B.kind === 'wall' || B.kind === 'column') continue;
    const b = B.box;
    const over = Math.max(-L.W / 2 - b.min.x, b.max.x - L.W / 2, -L.D / 2 - b.min.z, b.max.z - L.D / 2, -b.min.y);
    if (over > tol) out.push({ b: B, over, at: b.getCenter(new THREE.Vector3()) });
  }
  return out;
}

// A close-up around a world point, as a PNG data URL (null if off screen). It draws the scene with
// its own renderer and a copy of the camera narrowed to the spot, so taking one never steps the
// game (the renderer's own render() advances people, moments and effects).
// Crops make three.js objects (a renderer, a camera copy), so they run on the harness's tool stream
// (window.__tool), never the game's.
const tool = (fn) => (window.__tool ? window.__tool(fn) : fn());
let cropGL = null;
export function crop(R, at, size, zoom) {
  return tool(() => cropNow(R, at, size, zoom));
}
// A close-up around a screen point (client px) for a screen-space finding. The scene is drawn by
// cropAt; the labels, which are page elements and not in the scene, are drawn over it from their
// computed style (fill, border, corner radius, font and text) in page order, and then the finding's
// rectangles. rects: [{ r, color, text }] in client px. Client px are scaled to canvas px by the
// canvas's own ratio, so a device pixel ratio above 1 crops the same region.
export function cropScreen(R, x, y, rects, size = 240, zoom = 2) {
  return tool(() => {
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();
    const dpr = canvas.width / cr.width;
    const img = cropAt(R, (x - cr.left) * dpr, (y - cr.top) * dpr, size * dpr, zoom / dpr);
    const g = img.getContext('2d');
    const x0 = x - size / 2, y0 = y - size / 2;
    const map = (r) => ({ x: (r.left - x0) * zoom, y: (r.top - y0) * zoom, w: (r.right - r.left) * zoom, h: (r.bottom - r.top) * zoom });
    const labels = [...document.querySelectorAll('.hitl-lbl')]
      .filter((el) => el.style.display !== 'none' && el.isConnected)
      .map((el) => ({ el, inner: el.querySelector('.in') ?? el, z: Number(el.style.zIndex || 0) }))
      .sort((p, q) => p.z - q.z);
    for (const { el, inner } of labels) {
      const r = inner.getBoundingClientRect();
      if (r.right < x0 || r.left > x0 + size || r.bottom < y0 || r.top > y0 + size || r.width < 1) continue;
      const cs = getComputedStyle(inner), m = map(r);
      g.save();
      g.globalAlpha = Number(el.style.opacity || 1);
      g.beginPath();
      g.roundRect(m.x, m.y, m.w, m.h, (parseFloat(cs.borderTopLeftRadius) || 0) * zoom);
      g.fillStyle = cs.backgroundColor; g.fill();
      const bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw) { g.lineWidth = bw * zoom; g.strokeStyle = cs.borderTopColor; g.stroke(); }
      g.fillStyle = cs.color;
      g.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * zoom}px ${cs.fontFamily}`;
      g.textBaseline = 'top';
      const pad = (parseFloat(cs.paddingLeft) || 0) * zoom, lh = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25) * zoom;
      let line = '', ly = m.y + (parseFloat(cs.paddingTop) || 0) * zoom;
      for (const word of inner.textContent.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > m.w - 2 * pad && line) { g.fillText(line, m.x + pad, ly); ly += lh; line = word; } else line = next;
      }
      if (line) g.fillText(line, m.x + pad, ly);
      g.restore();
    }
    g.lineWidth = 3; g.font = '600 13px sans-serif'; g.textBaseline = 'alphabetic';
    for (const { r, color, text } of rects) {
      const m = map(r);
      g.strokeStyle = color; g.fillStyle = color;
      g.strokeRect(m.x, m.y, m.w, m.h);
      if (text) g.fillText(text.slice(0, 36), m.x + 4, m.y + 15);
    }
    return img.toDataURL('image/png');
  });
}

function cropNow(R, at, size = 200, zoom = 2) {
  const main = document.querySelector('canvas');
  const v = at.clone().project(R.camera);
  if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
  const img = cropAt(R, ((v.x + 1) / 2) * main.width, ((1 - v.y) / 2) * main.height, size, zoom);
  const g = img.getContext('2d');
  g.strokeStyle = '#ff2d55'; g.lineWidth = 3;
  g.beginPath(); g.arc(img.width / 2, img.height / 2, 22, 0, Math.PI * 2); g.stroke();
  return img.toDataURL('image/png');
}

// The scene drawn around canvas pixel (px, py), size canvas pixels across, zoom times larger.
function cropAt(R, px, py, size, zoom) {
  const main = document.querySelector('canvas');
  const px0 = size * zoom;
  if (!cropGL) {
    const c = document.createElement('canvas');
    cropGL = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
    cropGL.outputColorSpace = THREE.SRGBColorSpace;
    cropGL.toneMapping = THREE.ACESFilmicToneMapping;
    cropGL.toneMappingExposure = 1.05;
    cropGL.shadowMap.enabled = true;
  }
  cropGL.setSize(px0, px0, false);
  const cam = R.camera.clone();
  cam.setViewOffset(main.width, main.height, px - size / 2, py - size / 2, size, size);
  cam.updateProjectionMatrix();
  cropGL.render(R.scene, cam);
  const t = document.createElement('canvas');
  t.width = px0; t.height = px0;
  t.getContext('2d').drawImage(cropGL.domElement, 0, 0);
  return t;
}
