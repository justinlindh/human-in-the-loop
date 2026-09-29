// Screen-space cover: does part A hide part B from the camera, in how many of B's sample points, and
// which is in front. Head-relative pose numbers (a palm 9 cm in front of the eye) say nothing about
// what the camera sees once the head is turned; this measures what it sees.
//
// A measure is named cover<A><B>:
//   A  Hand (either hand's triangles, not the arm or sleeve), HandL, HandR, or Bubble (any scene DOM
//      speech bubble, label or emote rectangle)
//   B  EyeNear (the eye whose landmark is nearer the camera along its view, so the camera-side eye is
//      picked from the head's own facing; when the head faces the camera the eyes are level and the
//      eye the hand covers more is used), EyeFar, EyeL, EyeR (the character's left is head-local
//      negative x, as the pose landmarks define), or Face (the seven landmarks pose-visibility uses)
// Each B is sampled by points on an ellipse around its landmark in the face's own plane (the eye's own
// width and height from the model, foreshortened as the head turns, spread evenly by area); a sample is covered when a ray from the camera
// to it meets A first (a hand's triangles nearer the camera than the head's own surface, or a bubble's
// rectangle on screen). The value is the covered
// share, 0..1. measureCovers also returns per name { fraction, front, eye, samples }: front is 'a'
// when A is in front of most of B (>= 0.5), 'partial' for some, 'b' when nothing of A is in front.
import * as THREE from 'three';
import { faceLandmarks } from './pose-landmarks.js';
import { handTriangleStart } from './pose-projection.js';

import { COVER_MEASURE } from './pose-rules.js';
const EPSILON = 1e-4;
const eyeExtents = new WeakMap();

// Half of an eye's width and height in the head pivot's frame.
function eyeExtent(template) {
  if (!eyeExtents.has(template)) {
    const part = template.getObjectByName('eyes');
    if (!part?.geometry?.attributes.position) throw new Error('pose: cover needs the chibi eyes geometry');
    part.updateMatrix();
    const p = part.geometry.attributes.position;
    const pts = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(part.matrix));
    const mid = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()).x;
    const size = new THREE.Box3().setFromPoints(pts.filter((q) => q.x < mid)).getSize(new THREE.Vector3());
    eyeExtents.set(template, { rx: size.x / 2, ry: size.y / 2 });
  }
  return eyeExtents.get(template);
}

// The drawn eyes: the character's facial ink (its baked eyes and mouth mesh, beside the head mesh) in
// the head pivot's frame, its upper cluster of vertices split at the head's middle into the two eyes.
// This is what the camera sees, so it follows the character's own eye shape and mood; null when the
// ink has no separate eye cluster, and the model's eye geometry stands in.
function inkEyes(head) {
  let ink = null;
  head.parent.traverse((o) => { if (!ink && o.isMesh && o.visible && o.parent === head.parent && o.name === 'baked' && o.userData.noAO && !o.userData.part) ink = o; });
  const pos = ink?.geometry?.attributes.position;
  if (!pos) return null;
  ink.updateMatrix();
  const pts = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(ink.matrix));
  const ys = [...new Set(pts.map((p) => +p.y.toFixed(3)))].sort((a, b) => a - b);
  let cut = null, gap = 0.02;
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > gap) { gap = ys[i] - ys[i - 1]; cut = (ys[i] + ys[i - 1]) / 2; }
  if (cut == null) return null;
  const eyes = pts.filter((p) => p.y > cut);
  const half = (sign) => {
    const mine = eyes.filter((p) => (sign < 0 ? p.x < 0 : p.x >= 0));
    if (!mine.length) return null;
    const box = new THREE.Box3().setFromPoints(mine), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    // The centre sits on the ink's own surface: the nearest vertex to the box centre.
    const on = mine.reduce((best, p) => (p.distanceToSquared(c) < best.distanceToSquared(c) ? p : best), mine[0]);
    return { c: on, rx: sz.x / 2, ry: sz.y / 2 };
  };
  const L = half(-1), R = half(1);
  return L && R ? { EyeL: L, EyeR: R } : null;
}

// Points to test for B, in the head pivot's frame: the landmark and concentric rings of an ellipse
// around it in the face's own plane (so a turned head foreshortens them as it does the eye), spread
// evenly by area. Returned as offsets for the caller to place with the pivot's transform.
const RINGS = [[0, 1], [0.5, 6], [0.85, 12]];
function offsets(rx, ry) {
  return RINGS.flatMap(([f, n]) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * rx * f, Math.sin(a) * ry * f, 0);
  }));
}

export function measureCovers(R, { root, head }, template, names, overlays, canvas) {
  const camera = R.camera;
  const pivot = head.parent.matrixWorld;
  const model = eyeExtent(template);
  const lm = faceLandmarks(template);
  const world = (p) => p.clone().applyMatrix4(pivot);
  const ink = inkEyes(head);
  const size = { EyeL: ink?.EyeL ?? model, EyeR: ink?.EyeR ?? model };
  const localOf = { EyeL: ink?.EyeL.c ?? lm.EyeLeft[0], EyeR: ink?.EyeR.c ?? lm.EyeRight[0] };
  const eyes = { EyeL: world(localOf.EyeL), EyeR: world(localOf.EyeR) };
  const { rx, ry } = model;
  const depthOf = (p) => -p.clone().applyMatrix4(camera.matrixWorldInverse).z;
  // The camera-side eye is the nearer along the view. When the head faces the camera the two are
  // nearly level (their depth difference is under a quarter of the eye spacing) and neither is the
  // camera side, so the pick falls to whichever the hand covers more, and `of` says so.
  const gap = depthOf(eyes.EyeL) - depthOf(eyes.EyeR);
  const level = Math.abs(gap) < 0.25 * eyes.EyeL.distanceTo(eyes.EyeR);
  const near = gap <= 0 ? 'EyeL' : 'EyeR';
  const far = near === 'EyeL' ? 'EyeR' : 'EyeL';
  const faceLocal = ['EyeLeft', 'EyeRight', 'Brow', 'Forehead', 'Mouth', 'Chin'].flatMap((n) => lm[n]);
  const target = { EyeNear: [near, [localOf[near]]], EyeFar: [far, [localOf[far]]], EyeL: ['EyeL', [localOf.EyeL]], EyeR: ['EyeR', [localOf.EyeR]], Face: ['Face', faceLocal] };

  // The hands' meshes and where each one's hand triangles start (the baked arm is arm, then hand).
  const hands = [];
  root.traverseVisible((o) => {
    if (o.isMesh && (o.userData.part === 'armL' || o.userData.part === 'armR')) hands.push({ side: o.userData.part === 'armL' ? 'HandL' : 'HandR', mesh: o, from: handTriangleStart(o, template) });
  });
  const ray = new THREE.Raycaster();
  ray.layers.mask = camera.layers.mask;
  const ndcOf = (p) => p.clone().project(camera);
  const covered = (kind, p) => {
    const ndc = ndcOf(p);
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || Math.abs(ndc.z) > 1) return null;
    if (kind === 'Bubble') {
      const x = ((ndc.x + 1) / 2) * canvas.width, y = ((1 - ndc.y) / 2) * canvas.height;
      return overlays.some((o) => o.clippedRect && x >= o.clippedRect.left && x <= o.clippedRect.right && y >= o.clippedRect.top && y <= o.clippedRect.bottom);
    }
    const from = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera);
    const dir = p.clone().sub(from).normalize(), dist = from.distanceTo(p);
    ray.set(from, dir);
    // The ray runs a little past the sample, so a palm resting just behind the eye's plane still counts
    // where the head's own surface is not in front of it.
    ray.far = dist + Math.max(rx, ry) * 0.5;
    const nearest = (meshes, ok) => Math.min(Infinity, ...meshes.flatMap((m) => ray.intersectObject(m, false).filter((h) => ok(h, m)).map((h) => h.distance)));
    const palm = nearest(hands.filter((h) => kind === 'Hand' || h.side === kind).map((h) => h.mesh), (h, m) => h.faceIndex >= hands.find((x) => x.mesh === m).from);
    if (!Number.isFinite(palm)) return false;
    // A hand inside the head, behind its surface, is hidden by it and covers nothing.
    return palm < nearest([head], () => true);
  };

  const measures = {}, covers = {};
  const share = (a, b, which, centers) => {
    // An eye is the drawn eye's own size; a whole-face target uses small patches (half an eye) around each landmark.
    const sz = b === 'Face' ? { rx: rx * 0.5, ry: ry * 0.5 } : size[which];
    const off = offsets(sz.rx, sz.ry);
    const pts = centers.flatMap((c) => off.map((o) => world(c.clone().add(o))));
    const tests = pts.map((p) => covered(a, p));
    const onScreen = tests.filter((t) => t !== null);
    // Samples off screen count as uncovered, so a hand can't cover what the camera does not see.
    // Per ring (centre, middle, outer): where within B the cover is, for a palm that misses one edge.
    const ringOf = RINGS.flatMap(([, n], k) => Array.from({ length: n }, () => k));
    const rings = RINGS.map((_, k) => { const mine = tests.filter((_, i) => ringOf[i % off.length] === k); return +(mine.filter(Boolean).length / Math.max(1, mine.length)).toFixed(2); });
    return { fraction: pts.length ? tests.filter(Boolean).length / pts.length : 0, of: which, samples: pts.length, onScreen: onScreen.length, rings };
  };
  for (const name of names) {
    const [, a, b] = COVER_MEASURE.exec(name);
    let [which, centers] = target[b];
    let r = share(a, b, which, centers);
    if (b === 'EyeNear' && level) {
      const other = share(a, b, far, [localOf[far]]);
      if (other.fraction > r.fraction) r = other;
      r.of = `${r.of} (eyes level with the camera)`;
    }
    measures[name] = +r.fraction.toFixed(3);
    covers[name] = { fraction: +r.fraction.toFixed(3), front: r.fraction >= 0.5 ? 'a' : r.fraction > 0 ? 'partial' : 'b', of: r.of, samples: r.samples, onScreen: r.onScreen, rings: r.rings, eyeHalfSize: [+(b === 'Face' ? rx * 0.5 : size[r.of.slice(0, 4)].rx).toFixed(4), +(b === 'Face' ? ry * 0.5 : size[r.of.slice(0, 4)].ry).toFixed(4)] };
  }
  return { measures, covers };
}
