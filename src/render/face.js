import * as THREE from 'three';

// The face: eyes, eye shine, brows and mouth in one mesh laid on the front of the head, with a
// morph target per facial shape. Expressions are weight sets over those targets, so one shared
// geometry blends between any of them and each character draws its face in one call.
//
// Face-plane coordinates: x across the face (+x is the character's left as the camera sees a
// front view, matching the head part), dz up from the head centre, out off the head surface.
// A point maps to head space as (x, HEAD_C + dz, surface z + out); the head faces +z.
//
// createFaceGeometry(colors) -> BufferGeometry with morphAttributes.position, in MORPHS order.
//   colors: { ink: { color, roughness, metalness, tint }, shine: { ... } }
// EXPRESSIONS: name -> { morph: weight }. MORPHS: the morph target names.
// faceWeights(name, out?) -> Float32Array of MORPHS.length weights for an expression.
// bakeFace(geometry, weights) -> a static copy with those weights applied (Low quality).
// faceMetrics(geometry, weights) -> { mouthCorner, mouthOpen, browTilt, browLift, lidGap, gazeX, gazeY },
//   the measures checks use, in metres (browTilt: inner end above the outer end, positive is sad).

const HEAD_R = 0.21, HEAD_C = 0.22, HEAD_S = [1.06, 1.0, 0.96];   // the head ellipsoid (chibi.py)
const EX = 0.072, EZ = -0.01;            // eye centres
const EYE = [0.03, 0.046];               // eye half-width, half-height
const MZ = -0.07, MW = 0.03, MH = 0.0068;     // mouth centre, half-width, line half-thickness
const BROW = { z: 0.05, inner: 0.04, outer: 0.094, h: 0.0062 };   // below most fringes
const RINGS = 3, SEGS = 16, MOUTH_N = 13, BROW_N = 5;

export const MORPHS = [
  'blink', 'lidHalf', 'happyEyes', 'wide', 'lookX', 'lookUp', 'lookDown',
  'browUp', 'browAngry', 'browSad', 'browSkew',
  'smile', 'frown', 'open', 'grin', 'grit', 'smirk', 'wobble', 'talk',
];

export const EXPRESSIONS = {
  ok: { smile: 0.75 },
  coasting: { lidHalf: 0.6, browSkew: 0.15 },
  burnout: { blink: 1, frown: 0.8 },
  flat: { lidHalf: 0.6, browSkew: 0.15 },
  delighted: { grin: 1, happyEyes: 0.85, browUp: 0.6 },
  shocked: { open: 1, wide: 1, browUp: 1 },
  panicked: { open: 0.45, wobble: 0.9, wide: 0.8, browSad: 1 },
  gritted: { grit: 1, browAngry: 1, lidHalf: 0.3 },
  sad: { frown: 1, browSad: 1, lidHalf: 0.3, lookDown: 0.5 },
  smug: { smirk: 1, lidHalf: 0.45, browSkew: 0.7 },
  sideeye: { lookX: 1, lidHalf: 0.4, frown: 0.25, browAngry: 0.35 },
};

function surfZ(x, dz) {
  const k = 1 - (x / (HEAD_S[0] * HEAD_R)) ** 2 - (dz / (HEAD_S[2] * HEAD_R)) ** 2;
  return HEAD_R * HEAD_S[1] * Math.sqrt(Math.max(0, k));
}
// Unit normal of the head ellipsoid at a head-space point.
function surfNormal(x, y, z, out) {
  const a = HEAD_S[0] * HEAD_R, b = HEAD_S[2] * HEAD_R, c = HEAD_S[1] * HEAD_R;
  return out.set(x / (a * a), (y - HEAD_C) / (b * b), z / (c * c)).normalize();
}

// Each feature returns its vertices' face-plane points for a given single morph (null: basis),
// as [x, dz, out] triples, and its triangles; every call returns the same count in the same order.
function eye(s, m) {
  const cx = s * EX, cz = EZ, pts = [];
  const at = (rho, th) => {
    let x = EYE[0] * rho * Math.cos(th), z = EYE[1] * rho * Math.sin(th);
    const out = 0.009 * Math.sqrt(Math.max(0, 1 - rho * rho)) - 0.003;
    if (m === 'blink') z = z * 0.1 - 0.006;
    if (m === 'lidHalf' && z > 0) z *= 0.3;
    if (m === 'happyEyes') z = z * 0.12 + 0.014 * (1 - (x / EYE[0]) ** 2) - 0.004;
    if (m === 'wide') { x *= 1.15; z *= 1.18; }
    if (m === 'lookX') x += 0.007;
    if (m === 'lookUp') z += 0.008;
    if (m === 'lookDown') z -= 0.009;
    return [cx + x, cz + z, out];
  };
  pts.push(at(0, 0));
  for (let r = 1; r <= RINGS; r++) for (let i = 0; i < SEGS; i++) pts.push(at(r / RINGS, (i / SEGS) * Math.PI * 2));
  return pts;
}
function eyeTris(base) {
  const t = [];
  for (let i = 0; i < SEGS; i++) t.push([base, base + 1 + i, base + 1 + ((i + 1) % SEGS)]);
  for (let r = 1; r < RINGS; r++) for (let i = 0; i < SEGS; i++) {
    const a = base + 1 + (r - 1) * SEGS + i, b = base + 1 + (r - 1) * SEGS + ((i + 1) % SEGS);
    const c = a + SEGS, d = b + SEGS;
    t.push([a, c, d], [a, d, b]);
  }
  return t;
}
function shine(s, m) {
  let cx = s * EX + 0.011, cz = EZ + 0.016, k = 1;
  if (m === 'blink' || m === 'happyEyes') k = 0;
  if (m === 'lidHalf') { cz -= 0.014; k = 0.7; }
  if (m === 'wide') { cx = s * EX + 0.011 * 1.15; cz = EZ + 0.016 * 1.18; k = 1.15; }
  if (m === 'lookX') cx += 0.011;
  if (m === 'lookUp') cz += 0.01;
  if (m === 'lookDown') cz -= 0.012;
  const pts = [[cx, cz, 0.0085]];
  for (let i = 0; i < 8; i++) { const th = (i / 8) * Math.PI * 2; pts.push([cx + 0.011 * k * Math.cos(th), cz + 0.013 * k * Math.sin(th), 0.0075]); }
  return pts;
}
function shineTris(base) { const t = []; for (let i = 0; i < 8; i++) t.push([base, base + 1 + i, base + 1 + ((i + 1) % 8)]); return t; }
function brow(s, m) {
  const pts = [];
  for (let i = 0; i < BROW_N; i++) {
    const u = i / (BROW_N - 1);   // 0 inner, 1 outer
    let x = s * (BROW.inner + (BROW.outer - BROW.inner) * u), z = BROW.z + 0.008 * Math.sin(u * Math.PI);
    if (m === 'browUp') z += 0.014;
    if (m === 'browAngry') z += -0.013 * (1 - u) + 0.005 * u;
    if (m === 'browSad') z += 0.013 * (1 - u) - 0.006 * u;
    if (m === 'browSkew') z += s < 0 ? 0.013 : -0.004;
    const h = BROW.h * (1 - 0.35 * u);
    pts.push([x, z + h, 0.004], [x, z - h, 0.004]);
  }
  return pts;
}
function stripTris(base, n, flip) {
  const t = [];
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
    t.push(flip ? [a, c, b] : [a, b, c], flip ? [b, c, d] : [b, d, c]);
  }
  return t;
}
function mouth(m) {
  const pts = [];
  for (let i = 0; i < MOUTH_N; i++) {
    const t = (i / (MOUTH_N - 1)) * 2 - 1, e = 1 - t * t;
    const taper = MH * (0.55 + 0.45 * Math.sqrt(e));
    let w = MW, up = taper, lo = -taper;
    if (m === 'smile') { const c = 0.02 * t * t - 0.008; up += c; lo += c; }
    if (m === 'frown') { const c = -0.016 * t * t + 0.006; up += c; lo += c; }
    if (m === 'open') { w = MW * 0.85; up = 0.019 * Math.sqrt(e); lo = -0.027 * Math.sqrt(e); }
    if (m === 'grin') { w = MW * 1.25; up = 0.014 * t * t + 0.008; lo = up - 0.038 * Math.sqrt(e); }
    if (m === 'grit') { w = MW * 1.2; up = 0.0075 * Math.min(1, 3 * e); lo = -up; }
    if (m === 'smirk') { const c = 0.016 * Math.max(0, -t) ** 2 - 0.004; up += c; lo += c; }
    if (m === 'wobble') { const c = 0.0045 * Math.sin(3 * Math.PI * t); up = c + taper * 0.8; lo = c - taper * 0.8; }
    if (m === 'talk') { lo -= 0.012 * e; }
    pts.push([t * w, MZ + up, 0.003], [t * w, MZ + lo, 0.003]);
  }
  return pts;
}

// Every feature in mesh order: its point function and triangles, and which colour it takes.
function features() {
  const list = [];
  for (const s of [-1, 1]) list.push({ pts: (m) => eye(s, m), tris: eyeTris, color: 'ink', id: `eye${s}` });
  for (const s of [-1, 1]) list.push({ pts: (m) => shine(s, m), tris: shineTris, color: 'shine', id: `shine${s}` });
  for (const s of [-1, 1]) list.push({ pts: (m) => brow(s, m), tris: (b) => stripTris(b, BROW_N, s < 0), color: 'ink', id: `brow${s}` });
  list.push({ pts: (m) => mouth(m), tris: (b) => stripTris(b, MOUTH_N, false), color: 'ink', id: 'mouth' });
  return list;
}

const toHead = ([x, dz, out], n = new THREE.Vector3()) => {
  const z = surfZ(x, dz);
  surfNormal(x, HEAD_C + dz, z, n);
  return [x + n.x * out, HEAD_C + dz + n.y * out, z + n.z * out];
};

// Which vertex ranges belong to which feature, for the checks.
let RANGES = null;

export function createFaceGeometry(colors) {
  const feats = features();
  const pos = [], nor = [], col = [], surf = [], idx = [];
  const morph = MORPHS.map(() => []);
  const n = new THREE.Vector3();
  RANGES = {};
  for (const f of feats) {
    const base = pos.length / 3, basis = f.pts(null);
    RANGES[f.id] = [base, base + basis.length];
    const c = colors[f.color];
    for (const p of basis) {
      const h = toHead(p, n);
      pos.push(...h); nor.push(n.x, n.y, n.z);
      col.push(c.color.r, c.color.g, c.color.b);
      surf.push(c.roughness ?? 0.8, c.metalness ?? 0, c.tint ? 1 : 0);
    }
    MORPHS.forEach((m, k) => {
      const pm = f.pts(m);
      for (let i = 0; i < pm.length; i++) {
        const a = toHead(pm[i]), b = toHead(basis[i]);
        morph[k].push(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      }
    });
    for (const t of f.tris(base)) idx.push(...t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(surf, 3));
  g.setIndex(idx);
  g.morphAttributes.position = morph.map((d, k) => { const a = new THREE.Float32BufferAttribute(d, 3); a.name = MORPHS[k]; return a; });
  g.morphTargetsRelative = true;
  g.computeBoundingSphere();
  g.userData.ranges = RANGES;
  return g;
}

export function faceWeights(name, out = new Float32Array(MORPHS.length)) {
  out.fill(0);
  const e = EXPRESSIONS[name] ?? EXPRESSIONS.ok;
  MORPHS.forEach((m, k) => { out[k] = e[m] ?? 0; });
  return out;
}

// Positions with the morphs applied, as a new array.
function applied(geo, w) {
  const p = geo.attributes.position.array, out = new Float32Array(p);
  geo.morphAttributes.position.forEach((a, k) => {
    if (!w[k]) return;
    for (let i = 0; i < out.length; i++) out[i] += a.array[i] * w[k];
  });
  return out;
}

export function bakeFace(geo, w) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(applied(geo, w), 3));
  for (const k of ['normal', 'color', 'aSurf']) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

export function faceMetrics(geo, w) {
  const p = applied(geo, w), R = geo.userData.ranges;
  const v = (i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const ys = (r) => { const out = []; for (let i = r[0]; i < r[1]; i++) out.push(v(i)); return out; };
  const mouthV = ys(R.mouth);
  const mid = Math.floor(MOUTH_N / 2);
  const centreY = (mouthV[mid * 2][1] + mouthV[mid * 2 + 1][1]) / 2;
  const cornerY = (mouthV[0][1] + mouthV[1][1] + mouthV[mouthV.length - 2][1] + mouthV[mouthV.length - 1][1]) / 4;
  const mouthOpen = mouthV[mid * 2][1] - mouthV[mid * 2 + 1][1];
  // The camera's left brow (x < 0): inner pair first, outer pair last.
  const b = ys(R['brow-1']);
  const inner = (b[0][1] + b[1][1]) / 2, outer = (b[b.length - 2][1] + b[b.length - 1][1]) / 2;
  const basisBrow = BROW.z + HEAD_C;
  const e = ys(R['eye-1']);
  const eyeYs = e.map((q) => q[1]), eyeXs = e.map((q) => q[0]);
  return {
    mouthCorner: +(cornerY - centreY).toFixed(4),
    mouthOpen: +mouthOpen.toFixed(4),
    browTilt: +(inner - outer).toFixed(4),
    browLift: +(((inner + outer) / 2) - basisBrow).toFixed(4),
    lidGap: +(Math.max(...eyeYs) - Math.min(...eyeYs)).toFixed(4),
    gazeX: +(((Math.max(...eyeXs) + Math.min(...eyeXs)) / 2) + EX).toFixed(4),
    gazeY: +(((Math.max(...eyeYs) + Math.min(...eyeYs)) / 2) - (HEAD_C + EZ)).toFixed(4),
  };
}
