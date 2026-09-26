import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { measureScene } from '../blender/checks/pose-scene.js';
import { judgeScene } from '../blender/checks/pose-rules.js';
import { bakeParts } from '../src/render/bake.js';
import { createProbe } from '../src/render/probe.js';

let template;
beforeAll(async () => {
  const file = readFileSync(new URL('../public/models/chibi.glb', import.meta.url));
  template = (await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')).scene;
});
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  vi.stubGlobal('document', {
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }) }),
    querySelectorAll: () => [],
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3, 3, 5, -1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.updateMatrixWorld();
  const root = new THREE.Group(); root.name = 'character'; scene.add(root);
  const pivot = new THREE.Group(); pivot.position.y = 3.5; root.add(pivot);
  const head = template.getObjectByName('head').clone();
  head.material = new THREE.MeshBasicMaterial();
  head.userData = { part: 'head' }; pivot.add(head);
  for (const [side, x] of [['armL', -0.5], ['armR', 0.5]]) {
    const shoulder = new THREE.Group(), wrist = new THREE.Group();
    shoulder.position.set(x, 2.5, 0); wrist.position.y = -0.2;
    root.add(shoulder); shoulder.add(wrist);
    const arm = template.getObjectByName('arm').clone(), hand = template.getObjectByName('hand').clone();
    shoulder.add(arm); wrist.add(hand);
    bakeParts([arm, hand], shoulder, new THREE.MeshBasicMaterial(), () => false).userData.part = side;
  }
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshBasicMaterial());
  proxy.visible = false; proxy.userData.staffId = 's1'; root.add(proxy);
  for (let i = 0; i < 11; i++) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.5), new THREE.MeshBasicMaterial());
    part.position.y = i * 0.25; root.add(part);
  }
  const mask = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.1), new THREE.MeshBasicMaterial());
  mask.position.set(2, 3.5, 1); mask.userData.propId = 'face-only-mask'; scene.add(mask);
  const c = { root, probe: () => ({ anim: 'idle', eyes: new THREE.Vector3(0, 3.5, 0.4), head: new THREE.Vector3(0, 3.5, 0), forward: new THREE.Vector3(0, 0, 1), hands: [new THREE.Vector3(-0.5, 2, 0), new THREE.Vector3(0.5, 2, 0)] }) };
  const probe = createProbe({ scene, camera, office: { current: { columns: [] }, placed: new Map() }, charOf: () => c });
  const R = { scene, camera, probe: () => probe.measure('s1') };
  const measure = (frame = 0) => ({ frame, ...measureScene(R, {}, { faceTemplate: template })[0] });
  return { R, measure, root, pivot, head, mask };
}
const rule = { text: 'faceVisible>=0.9', id: 's1', measure: 'faceVisible', op: '>=', value: 0.9, share: 1 };
const judge = rows => judgeScene(rows, rows.map(r => r.frame), ['s1'], [rule]);

it('passes a clear face at the seven named skin landmarks', () => {
  const f = fixture(), row = f.measure();
  expect(row.faceVisible).toBe(1);
  expect(row.occluder).toBeNull();
  expect(row.faceSamples.map(p => p.name)).toEqual(['eyeLeft', 'eyeRight', 'browLeft', 'browRight', 'forehead', 'mouth', 'chin']);
  expect(judge([row]).pass).toBe(true);
});

it('fails a fully hidden face with a mostly visible body using the actual probe and judge', () => {
  const f = fixture(); f.mask.position.x = 0;
  const row = f.measure();
  expect(row.bodyVisible).toBeGreaterThanOrEqual(0.9);
  expect(row.faceVisible).toBe(0);
  expect(row.occluder).toBe('prop face-only-mask');
  expect(judge([row]).pass).toBe(false);
});

it('passes a clear face with a hidden body and keeps the body blocker separate', () => {
  const f = fixture();
  f.mask.position.set(0, 1.2, 1); f.mask.scale.y = 2.7;
  const row = f.measure();
  expect(row.bodyVisible).toBeLessThan(0.2);
  expect(row.bodyOccluder).toBe('prop face-only-mask');
  expect(row.faceVisible).toBe(1);
  expect(row.occluder).toBeNull();
  expect(judge([row]).pass).toBe(true);
});

it('resamples a moving blocker at consecutive frames despite the body probe cache', () => {
  const f = fixture();
  const rows = [f.measure(0)];
  f.mask.position.x = 0; rows.push(f.measure(1));
  f.mask.userData.propId = 'second-mask'; rows.push(f.measure(2));
  f.mask.position.x = 2; rows.push(f.measure(3));
  expect(rows.map(r => r.faceVisible)).toEqual([1, 0, 0, 1]);
  expect(rows.map(r => r.occluder)).toEqual([null, 'prop face-only-mask', 'prop second-mask', null]);
  expect(rows[1].bodyVisible).toBe(1);
  expect(judge(rows).pass).toBe(false);
  expect(judgeScene(rows, [0, 1, 2, 3], ['s1'], [{ ...rule, share: 0.5 }]).pass).toBe(true);
});

it('counts the subjects own head when the face turns away and follows head transforms', () => {
  const f = fixture();
  f.pivot.rotation.y = Math.PI;
  expect(f.measure().faceVisible).toBe(0);
  expect(f.measure().occluder).toBe('s1');
  f.pivot.rotation.y = 0; f.pivot.position.x = 1;
  f.mask.position.x = 1;
  expect(f.measure().faceVisible).toBe(0);
  f.pivot.position.x = -1;
  expect(f.measure().faceVisible).toBe(1);
});

it('honors hidden ancestors and transparent blockers, but includes self hands', () => {
  const f = fixture(); f.mask.position.x = 0;
  const parent = new THREE.Group(); f.R.scene.add(parent); parent.add(f.mask);
  parent.visible = false; expect(f.measure().faceVisible).toBe(1);
  parent.visible = true; f.mask.material.transparent = true; f.mask.material.opacity = 0.4;
  expect(f.measure().faceVisible).toBe(1);
  f.mask.material.opacity = 1; f.mask.userData = { staffId: 's1', part: 'self-hand-blocker' }; f.root.add(f.mask);
  expect(f.measure().faceVisible).toBe(0);
  expect(f.measure().occluder).toBe('s1');
});

it('rejects a narrow face blocker even when other landmarks are clear', () => {
  const f = fixture();
  f.mask.scale.set(0.08, 1, 1); f.mask.position.x = 0;
  const row = f.measure();
  expect(row.faceVisible).toBeGreaterThan(0);
  expect(row.faceVisible).toBeLessThan(0.9);
  expect(row.faceSamples.find(p => p.name === 'mouth').visible).toBe(false);
});

it('requires face geometry rather than substituting body visibility', () => {
  const f = fixture();
  expect(() => measureScene(f.R, {}, { faceTemplate: null })).toThrow('face visibility requires');
});

it('casts perspective rays and counts out-of-frame landmarks as invisible', () => {
  const f = fixture();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 3.5, 10); camera.updateMatrixWorld(); f.R.camera = camera;
  expect(f.measure().faceVisible).toBe(1);
  f.mask.position.x = 0; expect(f.measure().faceVisible).toBe(0);
  f.mask.position.x = 2;
  camera.setViewOffset(600, 600, 300, 0, 300, 600);
  const row = f.measure();
  expect(row.faceSamples.some(p => !p.onScreen)).toBe(true);
  expect(row.faceVisible).toBeLessThan(1);
  expect(row.occluder).toBeNull();
});

it('treats baked eye and mouth markings as part of the face while retaining head occlusion', () => {
  const f = fixture();
  const ink = template.getObjectByName('eyes').clone();
  ink.name = 'baked'; ink.userData = { noAO: true }; f.pivot.add(ink);
  expect(f.measure().faceVisible).toBe(1);
  f.pivot.rotation.y = Math.PI;
  expect(f.measure().faceVisible).toBe(0);
});
