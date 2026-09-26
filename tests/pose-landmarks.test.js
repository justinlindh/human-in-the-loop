import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { faceLandmarks, landmarkContacts, LANDMARKS } from '../blender/checks/pose-landmarks.js';

async function targets() {
  const file = readFileSync(new URL('../public/models/chibi.glb', import.meta.url));
  const model = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  return faceLandmarks(model.scene);
}

it('derives distinct upper and lower face targets from the model', async () => {
  const p = await targets();
  expect(Object.keys(p)).toEqual(LANDMARKS);
  expect(p.EyeLeft[0].x).toBeLessThan(p.EyeRight[0].x);
  expect(p.Brow[0].y).toBeGreaterThan(p.Eye[0].y);
  expect(p.Forehead[0].y).toBeGreaterThan(p.Brow[0].y);
  expect(p.Mouth[0].y).toBeLessThan(p.Eye[0].y);
  expect(p.Chin[0].y).toBeLessThan(p.Mouth[0].y);
  const c = landmarkContacts(p, new THREE.Matrix4(), [p.Chin[0], p.EyeLeft[0]]);
  expect(c.hand0Chin).toBe(0);
  expect(c.hand0Eye).toBeGreaterThan(0.04);
  expect(c.hand0Brow).toBeGreaterThan(0.04);
  expect(c.hand1Eye).toBe(0);
  expect(c.hand1EyeLeft).toBe(0);
  expect(c.hand1EyeRight).toBeGreaterThan(0.04);
});

it('follows head pitch, roll, yaw, translation and scale without moving local targets', async () => {
  const p = await targets();
  const before = p.EyeLeft[0].clone();
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2, 3, -1), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 1.4, 0.3)), new THREE.Vector3(1.2, 1.2, 1.2));
  const contact = landmarkContacts(p, matrix, [p.EyeLeft[0].clone().applyMatrix4(matrix), p.Chin[0].clone().applyMatrix4(matrix)]);
  expect(contact.hand0EyeLeft).toBe(0);
  expect(contact.hand1Chin).toBe(0);
  expect(contact.hand1Brow).toBeGreaterThan(0.04);
  expect(p.EyeLeft[0].equals(before)).toBe(true);
});
