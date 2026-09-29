// Screen-space cover: does part A hide part B from the camera, in how many of B's sample points, and
// which is in front. Head-relative pose numbers (a palm 9 cm in front of the eye) say nothing about
// what the camera sees once the head is turned; this measures what it sees.
//
// A measure is named cover<A><B>:
//   A  Hand (either hand's triangles, not the arm or sleeve), HandL, HandR, or Bubble (any scene DOM
//      speech bubble, label or emote rectangle)
//   B  EyeNear (the eye whose landmark is nearer the camera along its view, so the camera-side eye is
//      picked from the head's own facing), EyeFar, EyeL, EyeR (the character's left is head-local
//      negative x, as the pose landmarks define), or Face (the seven landmarks pose-visibility uses)
// Each B is sampled by a small disc of points in the camera plane around its landmark (the eye's own
// radius from the model, so it scales with the head); a sample is covered when a ray from the camera
// to it meets A first (a hand's triangles nearer the camera than the head's own surface, or a bubble's
// rectangle on screen). The value is the covered
// share, 0..1. measureCovers also returns per name { fraction, front, eye, samples }: front is 'a'
// when A is in front of most of B (>= 0.5), 'partial' for some, 'b' when nothing of A is in front.
import * as THREE from 'three';
import { faceLandmarks } from './pose-landmarks.js';
import { handTriangleStart } from './pose-projection.js';

import { COVER_MEASURE } from './pose-rules.js';
const EPSILON = 1e-4;
const eyeRadii = new WeakMap();

// Each eye's half-extent in the head pivot's frame (the larger of its width and height).
function eyeRadius(template) {
  if (!eyeRadii.has(template)) {
    const part = template.getObjectByName('eyes');
    if (!part?.geometry?.attributes.position) throw new Error('pose: cover needs the chibi eyes geometry');
    part.updateMatrix();
    const p = part.geometry.attributes.position;
    const pts = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(part.matrix));
    const mid = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3()).x;
    const half = pts.filter((q) => q.x < mid);
    const size = new THREE.Box3().setFromPoints(half).getSize(new THREE.Vector3());
    eyeRadii.set(template, Math.max(size.x, size.y) / 2);
  }
  return eyeRadii.get(template);
}

// Points to test for B: its landmark and rings around it, in the plane facing the camera.
function samplePoints(centers, radius, camera) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const rings = centers.length === 1 ? [[0, 1], [0.5, 8], [0.95, 8]] : [[0, 1], [0.5, 4]];
  return centers.flatMap((c) => rings.flatMap(([f, n]) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return c.clone().addScaledVector(right, Math.cos(a) * radius * f).addScaledVector(up, Math.sin(a) * radius * f);
  })));
}

export function measureCovers(R, { root, head }, template, names, overlays, canvas) {
  const camera = R.camera;
  const pivot = head.parent.matrixWorld;
  const scale = new THREE.Vector3().setFromMatrixScale(pivot);
  const radius = eyeRadius(template) * Math.max(scale.x, scale.y, scale.z);
  const lm = faceLandmarks(template);
  const world = (p) => p.clone().applyMatrix4(pivot);
  const eyes = { EyeL: world(lm.EyeLeft[0]), EyeR: world(lm.EyeRight[0]) };
  const depthOf = (p) => -p.clone().applyMatrix4(camera.matrixWorldInverse).z;
  const near = depthOf(eyes.EyeL) <= depthOf(eyes.EyeR) ? 'EyeL' : 'EyeR';
  const far = near === 'EyeL' ? 'EyeR' : 'EyeL';
  const faceCenters = ['EyeLeft', 'EyeRight', 'Brow', 'Forehead', 'Mouth', 'Chin'].flatMap((n) => lm[n].map(world));
  const target = { EyeNear: [near, [eyes[near]]], EyeFar: [far, [eyes[far]]], EyeL: ['EyeL', [eyes.EyeL]], EyeR: ['EyeR', [eyes.EyeR]], Face: ['Face', faceCenters] };

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
    ray.far = dist + radius * 0.5;
    const nearest = (meshes, ok) => Math.min(Infinity, ...meshes.flatMap((m) => ray.intersectObject(m, false).filter((h) => ok(h, m)).map((h) => h.distance)));
    const palm = nearest(hands.filter((h) => kind === 'Hand' || h.side === kind).map((h) => h.mesh), (h, m) => h.faceIndex >= hands.find((x) => x.mesh === m).from);
    if (!Number.isFinite(palm)) return false;
    // A hand inside the head, behind its surface, is hidden by it and covers nothing.
    return palm < nearest([head], () => true);
  };

  const measures = {}, covers = {};
  for (const name of names) {
    const [, a, b] = COVER_MEASURE.exec(name);
    const [which, centers] = target[b];
    const pts = samplePoints(centers, radius * (b === 'Face' ? 0.5 : 1), camera);
    const tests = pts.map((p) => covered(a, p));
    const onScreen = tests.filter((t) => t !== null);
    const hit = onScreen.filter(Boolean).length;
    // Samples off screen count as uncovered, so a hand can't cover what the camera does not see.
    const fraction = pts.length ? hit / pts.length : 0;
    measures[name] = +fraction.toFixed(3);
    covers[name] = { fraction: +fraction.toFixed(3), front: fraction >= 0.5 ? 'a' : fraction > 0 ? 'partial' : 'b', of: which, samples: pts.length, onScreen: onScreen.length };
  }
  return { measures, covers };
}
