import * as THREE from 'three';
import { mat } from './materials.js';

// Role graphics on shirt fronts. Each design is a few flat shapes in palette colours, laid onto the
// torso (or the engineer's hoodie pouch) by casting rays from the front, then baked into the torso
// mesh with everything else: a print costs no draw call and no texture.
//
// Designs are authored in a unit box (x and y in -1..1, y up). Every design is a sticker: an ink
// layer under a lighter layer, so it reads on light and dark shirts alike.

const LIFT = 0.0015;        // first layer off the surface
const MAX_EDGE = 0.2;       // design units: longer triangle edges are split so the print follows the curve
const LAYER = 0.0007;       // each later layer off the one below

function circle(cx, cy, r) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}
function poly(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
function roundRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
// A polyline of width w: one quad per segment and a disc at each joint and end.
function stroke(pts, w) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * w / 2, ny = ((bx - ax) / len) * w / 2;
    out.push(poly([[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]]));
  }
  for (const [x, y] of pts) out.push(circle(x, y, w / 2));
  return out;
}
function heart(cx, cy, s) {
  const h = new THREE.Shape();
  const P = (x, y) => [cx + x * s, cy + y * s];
  h.moveTo(...P(0, -0.85));
  h.bezierCurveTo(...P(-0.25, -0.6), ...P(-1, -0.2), ...P(-1, 0.3));
  h.bezierCurveTo(...P(-1, 0.8), ...P(-0.35, 0.95), ...P(0, 0.5));
  h.bezierCurveTo(...P(0.35, 0.95), ...P(1, 0.8), ...P(1, 0.3));
  h.bezierCurveTo(...P(1, -0.2), ...P(0.25, -0.6), ...P(0, -0.85));
  return h;
}
const bubble = (grow) => [roundRect(-0.85 - grow, -0.45 - grow, 0.85 + grow, 0.75 + grow, 0.35 + grow), poly([[-0.45 - grow, -0.4], [-0.62 - grow * 1.6, -0.95 - grow * 1.6], [-0.05 + grow, -0.4]])];

const OUT = 0.22;           // ink outline width in design units
export const DESIGNS = {
  brackets: () => {
    const lines = [[[-0.35, 0.55], [-0.8, 0], [-0.35, -0.55]], [[0.35, 0.55], [0.8, 0], [0.35, -0.55]], [[0.18, 0.7], [-0.18, -0.7]]];
    return [['ink', lines.flatMap((l) => stroke(l, 0.24 + OUT))], ['paper', lines.flatMap((l) => stroke(l, 0.24))]];
  },
  terminal: () => {
    const lines = [[[-0.75, 0.45], [-0.3, 0], [-0.75, -0.45]], [[0.0, -0.45], [0.7, -0.45]]];
    return [['ink', lines.flatMap((l) => stroke(l, 0.26 + OUT))], ['paper', lines.flatMap((l) => stroke(l, 0.26))]];
  },
  branch: () => {
    const lines = [[[-0.45, -0.7], [-0.45, 0.7]], [[-0.45, -0.25], [0.45, 0.15], [0.45, 0.5]]];
    const nodes = (g) => [[-0.45, -0.7], [-0.45, 0.7], [0.45, 0.5]].map(([x, y]) => circle(x, y, 0.24 + g));
    return [['ink', [...lines.flatMap((l) => stroke(l, 0.16 + OUT)), ...nodes(OUT / 2)]], ['paper', [...lines.flatMap((l) => stroke(l, 0.16)), ...nodes(0)]]];
  },
  pen: () => {
    const nib = (g) => poly([[0, -0.9 - g], [-0.55 - g, 0.05], [-0.3 - g, 0.75 + g], [0.3 + g, 0.75 + g], [0.55 + g, 0.05]]);
    return [['ink', [nib(OUT / 2)]], ['paper', [nib(0)]], ['ink', [...stroke([[0, -0.85], [0, -0.05]], 0.1), circle(0, 0.05, 0.16)]]];
  },
  swatches: () => {
    const sq = (x, y, g) => roundRect(x - 0.36 - g, y - 0.36 - g, x + 0.36 + g, y + 0.36 + g, 0.12 + g);
    const at = [[-0.5, 0.35], [0.5, 0.35], [0, -0.45]];
    return [['ink', at.map(([x, y]) => sq(x, y, OUT / 2))], ['gold', [sq(...at[0], 0)]], ['role_designer', [sq(...at[1], 0)]], ['fabric_teal', [sq(...at[2], 0)]]];
  },
  bezier: () => {
    const curve = new THREE.CubicBezierCurve(new THREE.Vector2(-0.8, -0.5), new THREE.Vector2(-0.4, 0.9), new THREE.Vector2(0.4, -0.9), new THREE.Vector2(0.8, 0.5));
    const pts = curve.getPoints(10).map((p) => [p.x, p.y]);
    const knots = (g) => [[-0.8, -0.5], [0.8, 0.5]].map(([x, y]) => roundRect(x - 0.18 - g, y - 0.18 - g, x + 0.18 + g, y + 0.18 + g, 0.04));
    return [['ink', [...stroke(pts, 0.16 + OUT), ...knots(OUT / 2)]], ['paper', [...stroke(pts, 0.16), ...knots(0)]]];
  },
  heart: () => [['ink', [heart(0, 0.05, 0.95 + OUT / 2)]], ['paper', [heart(0, 0.05, 0.95)]]],
  chat: () => [['ink', bubble(OUT / 2)], ['paper', bubble(0)], ['ink', [-0.42, 0, 0.42].map((x) => circle(x, 0.15, 0.13))]],
};

// Where a role's print sits, in torso space at the middle build (x across, y up): support prints
// fill the chest, designers print on the left chest beside the scarf tails, engineers print on the
// hoodie pouch. `sx` scales x with the build's width; `h` is the design's half height.
const REGION = {
  support: { x: 0, y: 0.13, w: 0.075, h: 0.058 },
  designer: { x: -0.09, y: 0.15, w: 0.034, h: 0.04 },
  engineer: { x: 0, y: 0.08, w: 0.05, h: 0.034 },
};

// Splits a flat geometry's triangles in four until no edge is longer than MAX_EDGE, so a laid-on
// print bends with the torso instead of cutting through it between far-apart vertices.
function tessellate(geo) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  let tris = [];
  const p = src.attributes.position;
  for (let i = 0; i < p.count; i += 3) tris.push([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k)]));
  const out = [];
  while (tris.length) {
    const t = tris.pop();
    const long = [0, 1, 2].some((k) => Math.hypot(t[k][0] - t[(k + 1) % 3][0], t[k][1] - t[(k + 1) % 3][1]) > MAX_EDGE);
    if (!long) { out.push(t); continue; }
    const m = [0, 1, 2].map((k) => [(t[k][0] + t[(k + 1) % 3][0]) / 2, (t[k][1] + t[(k + 1) % 3][1]) / 2]);
    tris.push([t[0], m[0], m[2]], [m[0], t[1], m[1]], [m[2], m[1], t[2]], [m[0], m[1], m[2]]);
  }
  const pos = new Float32Array(out.length * 9);
  out.forEach((t, i) => t.forEach(([x, y], k) => { pos[i * 9 + k * 3] = x; pos[i * 9 + k * 3 + 1] = y; }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// Building a print makes three.js objects, and each takes a UUID from Math.random, which the checks
// seed as the game's own stream. Prints draw from a stream of their own, so whether someone wears one
// never changes what the game draws next.
let own = 1;
const ownRandom = () => { own = (own * 16807) % 2147483647; return (own - 1) / 2147483646; };
function isolated(fn) {
  const prev = Math.random;
  Math.random = ownRandom;
  try { return fn(); } finally { Math.random = prev; }
}

const cache = new Map();
const ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();

// Meshes for a role's print, children of `torso`, laid onto `targets` (meshes already under torso).
// Geometry is built once per design, role, build and garment and shared by everyone who wears it.
export function printParts(...args) { return isolated(() => buildParts(...args)); }

function buildParts(design, role, torso, targets, key, wScale) {
  const r = REGION[role];
  const make = DESIGNS[design];
  if (!r || !make) return [];
  const ck = `${design}|${role}|${key}`;
  let layers = cache.get(ck);
  if (!layers) {
    torso.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(torso.matrixWorld).invert();
    layers = make().map(([color, shapes], li) => {
      const g = tessellate(new THREE.ShapeGeometry(shapes, 6));
      const p = g.attributes.position;
      const nrm = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = r.x * wScale + p.getX(i) * r.w * wScale, y = r.y + p.getY(i) * r.h;
        _o.set(x, y, 0.5).applyMatrix4(torso.matrixWorld);
        _d.set(0, 0, -1).transformDirection(torso.matrixWorld);
        ray.set(_o, _d);
        const hit = ray.intersectObjects(targets, true)[0];
        if (!hit) { p.setXYZ(i, x, y, 0); continue; }
        _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(inv);
        const q = hit.point.applyMatrix4(inv).addScaledVector(_n, LIFT + li * LAYER);
        p.setXYZ(i, q.x, q.y, q.z);
        nrm[i * 3] = _n.x; nrm[i * 3 + 1] = _n.y; nrm[i * 3 + 2] = _n.z;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.userData.shared = true;
      return [color, g];
    });
    cache.set(ck, layers);
  }
  return layers.map(([color, g]) => {
    const m = new THREE.Mesh(g, mat(color));
    m.userData.noAO = true;
    return m;
  });
}
