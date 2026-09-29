#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createRuntime } from './runtime.mjs';

const runtime = await createRuntime();
const THREE = await import('three');
const { meshContact, castLandmark } = await import('./geometry.mjs');
const { faceLandmarks } = await import('../../blender/checks/pose-landmarks.js');
const { getTemplate } = await import('../../src/render/models.js');
const { createNav } = await import('../../src/render/layout.js');
const { projectedHead } = await import('./model.mjs');
const results = [];
const check = (name, actual, predicate) => { assert.ok(predicate(actual), `${name}: ${JSON.stringify(actual)}`); results.push({ name, pass: true, actual }); };
const mesh = (name, geometry, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.name = name; m.position.set(x, y, z); m.updateMatrixWorld(true); return m;
};
const head = mesh('head-proxy', new THREE.BoxGeometry(0.5, 0.5, 0.5), 0, 0.25);
for (const intrusion of [-0.01, 0.005, 0.02, 0.1, 0.25]) {
  const desk = mesh('thin-desk-top', new THREE.BoxGeometry(2, 0.006, 2), 0, 0.5 - intrusion + 0.003);
  const contact = globalThis.__tool(() => meshContact(head, desk, { clearance: true }));
  check(`thin desk intrusion ${intrusion} m`, contact, c => c.intersects === (intrusion > 0) && (intrusion > 0 || Math.abs(c.clearanceM - 0.01) < 1e-6));
}
const nested = mesh('contained', new THREE.BoxGeometry(0.1, 0.1, 0.1), 0, 0.25);
check('full containment', globalThis.__tool(() => meshContact(head, nested)), c => c.intersects && c.containment && !c.surfaceCrossing);
for (const gap of [0.02, 0.2, 0.6]) {
  const furniture = mesh('furniture', new THREE.BoxGeometry(0.5, 0.5, 0.5), 0.5 + gap, 0.25);
  check(`clearance ${gap} m`, globalThis.__tool(() => meshContact(head, furniture, { clearance: true })), c => !c.intersects && Math.abs(c.clearanceM - gap) < 1e-6);
}
runtime.stepTo(1);
let characterRoot;
runtime.R.scene.traverse(o => { if (!characterRoot && o.name === 'character') characterRoot = o; });
const character = globalThis.__sceneCharacters.get(characterRoot);
const actualHead = character.head.children.find(o => o.userData.part === 'head');
const headBounds = new THREE.Box3().setFromObject(actualHead, true);
const headCenter = headBounds.getCenter(new THREE.Vector3());
for (const intrusion of [-0.01, 0.005, 0.02, 0.1]) {
  const desk = mesh('thin-desk-through-live-head', new THREE.BoxGeometry(2, 0.006, 2), headCenter.x, headBounds.max.y - intrusion + 0.003, headCenter.z);
  check(`live character head intrusion ${intrusion} m`, globalThis.__tool(() => meshContact(actualHead, desk)), c => c.intersects === (intrusion > 0));
}
const local = faceLandmarks(getTemplate('chibi'));
const eye = local.EyeLeft[0].clone().applyMatrix4(character.head.matrixWorld);
const forward = new THREE.Vector3(0, 0, 1).transformDirection(character.head.matrixWorld);
const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
camera.position.copy(eye).addScaledVector(forward, 3); camera.lookAt(eye); camera.updateMatrixWorld();
const scene = new THREE.Scene();
const controlHead = actualHead.clone(); controlHead.matrixAutoUpdate = false;
controlHead.matrix.copy(actualHead.matrixWorld); scene.add(controlHead); scene.updateMatrixWorld();
const ray = point => globalThis.__tool(() => castLandmark(scene, camera, point, { identify: o => o.name }));
check('uncovered real eye', ray(eye), r => r.visible && !r.blocker);
const hand = mesh('hand-over-eye', new THREE.BoxGeometry(0.1, 0.1, 0.08));
hand.position.copy(eye).addScaledVector(forward, 0.15); scene.add(hand); scene.updateMatrixWorld();
check('hand covers real eye', ray(eye), r => !r.visible && r.blocker === hand.name);
scene.remove(hand);
const wall = mesh('wall-in-front-of-person', new THREE.BoxGeometry(2, 2, 0.06));
wall.position.copy(eye).addScaledVector(forward, 0.3); wall.quaternion.copy(camera.quaternion); scene.add(wall); scene.updateMatrixWorld();
for (const name of ['EyeLeft', 'EyeRight', 'Forehead', 'Mouth', 'Chin']) {
  check(`wall blocks ${name}`, ray(local[name][0].clone().applyMatrix4(character.head.matrixWorld)), r => !r.visible && r.blocker === wall.name);
}
scene.remove(wall);
check('offscreen landmark', ray(eye.clone().add(new THREE.Vector3(10, 0, 0))), r => !r.onScreen && !r.visible);
const projectionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
projectionCamera.position.z = 5; projectionCamera.updateMatrixWorld();
const spanning = mesh('spanning-screen', new THREE.BoxGeometry(4, 4, 0.1));
check('viewport-spanning geometry projects even with every vertex outside', projectedHead(spanning, projectionCamera, 100, 100), r => r.onScreen && r.clipped && r.clippedRectangle.left === 0 && r.clippedRectangle.right === 100);
spanning.position.x = 10; spanning.updateMatrixWorld();
check('offscreen head projection', projectedHead(spanning, projectionCamera, 100, 100), r => !r.onScreen && r.clippedRectangle === null);
const plain = createNav({ W: 4, D: 4 }, []), blocked = createNav({ W: 4, D: 4 }, [{ x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5 }]);
check('walk grid responds to planted desk', { plain: plain.isBlocked(0, 0), blocked: blocked.isBlocked(0, 0) }, r => !r.plain && r.blocked);
const report = { schema: 'hitl.scene-controls/0.1', passed: results.length,
  missingAssertions: ['Exact general-solid penetration depth is unavailable; crossing detection and clearance controls do not prove it.'], results };
const out = process.argv.indexOf('--out');
if (out >= 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
