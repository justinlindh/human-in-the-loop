import * as THREE from 'three';
import { rectOverlap } from './intersect.js';

const labelIds = new WeakMap();
let nextLabel = 1;
const empty = status => ({ status, rect: null, clippedRect: null, clipped: false });
const planes = [v => v.w + v.z, v => v.w - v.z, v => v.w + v.x, v => v.w - v.x, v => v.w + v.y, v => v.w - v.y];

function clip(poly, plane) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = plane(a), db = plane(b);
    if (da >= 0) out.push(a);
    if ((da < 0) !== (db < 0)) out.push(a.clone().lerp(b, da / (da - db)));
  }
  return out;
}
function bounds(points, canvas) {
  if (!points.length) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) {
    const x = (p.x / p.w + 1) * canvas.width / 2, y = (1 - p.y / p.w) * canvas.height / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('pose: nonfinite projected geometry');
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return { left, right, top, bottom };
}

// Clip triangles before perspective division, including triangles spanning the entire viewport.
export function projectTriangles(vertices, matrix, camera, canvas) {
  if (!vertices.length || vertices.length % 3) throw new Error('pose: projection requires complete triangles');
  const transform = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(matrix);
  const depth = [], visible = [];
  let clipped = false;
  for (let i = 0; i < vertices.length; i += 3) {
    let poly = vertices.slice(i, i + 3).map(p => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(transform));
    if (poly.some(p => !p.toArray().every(Number.isFinite))) throw new Error('pose: nonfinite source geometry');
    clipped ||= poly.some(p => planes.some(plane => plane(p) < 0));
    for (const plane of planes.slice(0, 2)) poly = clip(poly, plane);
    depth.push(...poly);
    for (const plane of planes.slice(2)) poly = clip(poly, plane);
    visible.push(...poly);
  }
  return { status: visible.length ? 'projected' : 'offscreen', rect: bounds(depth, canvas), clippedRect: bounds(visible, canvas), clipped };
}

function drawable(mesh, camera) {
  for (let o = mesh; o; o = o.parent) if (!o.visible) return false;
  if (!mesh.layers.test(camera.layers)) return false;
  const materials = [].concat(mesh.material ?? []);
  return materials.some(m => m.visible !== false && !(m.transparent && m.opacity === 0));
}
function vertices(mesh) {
  const g = mesh?.geometry, pos = g?.attributes.position;
  if (!pos) throw new Error('pose: projection requires mesh positions');
  const n = g.index?.count ?? pos.count;
  return Array.from({ length: n }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, g.index ? g.index.getX(i) : i));
}

// bakeParts concatenates arm then hand, both non-indexed, in shoulder space. Validate that
// each source shape survives as a translation before trusting the hand's triangle range.
function handVertices(arm, template) {
  const parts = ['arm', 'hand'].map(name => {
    const mesh = template?.getObjectByName(name);
    if (!mesh?.isMesh) throw new Error(`pose: projected hands require template ${name}`);
    mesh.updateMatrix();
    return vertices(mesh).map(p => p.applyMatrix4(mesh.matrix));
  });
  const actual = vertices(arm);
  if (actual.length !== parts[0].length + parts[1].length) throw new Error('pose: unsupported baked arm topology');
  let at = 0;
  for (const part of parts) {
    const offset = actual[at].clone().sub(part[0]);
    for (let i = 0; i < part.length; i++) {
      if (actual[at + i].clone().sub(part[i]).distanceTo(offset) > 1e-5) throw new Error('pose: unsupported baked hand geometry');
    }
    at += part.length;
  }
  return actual.slice(parts[0].length);
}

const localRect = (r, canvas) => ({ left: r.left - canvas.left, right: r.right - canvas.left, top: r.top - canvas.top, bottom: r.bottom - canvas.top });
function domRect(r, canvas) {
  const rect = localRect(r, canvas);
  const clippedRect = { left: Math.max(0, rect.left), right: Math.min(canvas.width, rect.right), top: Math.max(0, rect.top), bottom: Math.min(canvas.height, rect.bottom) };
  const on = clippedRect.right > clippedRect.left && clippedRect.bottom > clippedRect.top;
  return { status: on ? 'projected' : 'offscreen', rect, clippedRect: on ? clippedRect : null, clipped: !on || Object.keys(rect).some(k => rect[k] !== clippedRect[k]) };
}
function spriteProjection(sprite, camera, canvas) {
  if (!drawable(sprite, camera)) return empty('hidden');
  const center = new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
  const scale = new THREE.Vector3().setFromMatrixScale(sprite.matrixWorld);
  if (camera.isPerspectiveCamera && sprite.material.sizeAttenuation === false) scale.multiplyScalar(-center.z);
  const angle = sprite.material.rotation, cos = Math.cos(angle), sin = Math.sin(angle);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => {
    const a = (x - sprite.center.x) * scale.x, b = (y - sprite.center.y) * scale.y;
    return center.clone().add(new THREE.Vector3(cos * a - sin * b, sin * a + cos * b, 0)).applyMatrix4(camera.matrixWorld);
  });
  return projectTriangles([corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]], new THREE.Matrix4(), camera, canvas);
}

// The first triangle of the hand within a baked arm mesh (arm triangles come first; see handVertices).
export function handTriangleStart(arm, template) {
  const part = template?.getObjectByName('arm');
  if (!part?.isMesh) throw new Error('pose: projected hands require template arm');
  const n = vertices(part).length;
  if (arm.geometry.index || n % 3) throw new Error('pose: unsupported baked arm topology');
  return n / 3;
}

export function sceneOverlays(R, sc, canvas, characters) {
  // Reuse screen()'s DOM selection and measured rectangles; IDs track the live pooled element.
  const elements = [...document.querySelectorAll('.hitl-lbl')].filter(el => {
    if (el.style.display === 'none' || Number(el.style.opacity || 1) < 0.6 || !el.isConnected) return false;
    const r = (el.querySelector('.in') ?? el).getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  });
  if (elements.length !== sc.labels.length) throw new Error('pose: label snapshot changed during measurement');
  const out = sc.labels.map((l, i) => {
    const el = elements[i];
    if (!labelIds.has(el)) labelIds.set(el, `label:${nextLabel++}`);
    return { id: labelIds.get(el), subjectId: null, kind: l.kind, text: l.text, ...domRect(l.r, canvas) };
  });
  for (const [id, { root }] of characters) root.traverse(o => {
    if (o.isSprite && o.renderOrder === 10) out.push({ id: `emote:${id}:${o.uuid}`, subjectId: id, kind: 'emote', text: null, ...spriteProjection(o, R.camera, canvas) });
  });
  return out;
}

export function projectedSubject(R, character, template, canvas, faceRect, overlays) {
  const { root, head } = character;
  const face = drawable(head, R.camera) ? projectTriangles(vertices(head), head.matrixWorld, R.camera, canvas) : empty('hidden');
  face.coverageRect = localRect(faceRect, canvas);
  const hands = {};
  for (const [side, tag] of [['left', 'armL'], ['right', 'armR']]) {
    const arms = [];
    root.traverse(o => { if (o.userData.part === tag) arms.push(o); });
    if (arms.length !== 1) throw new Error(`pose: projected ${side} hand requires one ${tag} mesh`);
    const arm = arms[0];
    hands[side] = drawable(arm, R.camera) ? projectTriangles(handVertices(arm, template), arm.matrixWorld, R.camera, canvas) : empty('hidden');
  }
  return {
    units: 'css-pixels', origin: 'canvas-top-left', canvas: { width: canvas.width, height: canvas.height, clientLeft: canvas.left, clientTop: canvas.top },
    face, hands,
    overlays: overlays.map(o => ({ ...o, overlapsFace: !!(face.clippedRect && o.clippedRect && rectOverlap(face.clippedRect, o.clippedRect).area > 0) })),
  };
}
