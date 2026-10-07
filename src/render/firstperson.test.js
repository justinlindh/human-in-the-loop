import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createFirstPerson } from './firstperson.js';

// A 10 x 8 m room with one desk-sized block, the door on the +z wall, and staff as plain records.
function world({ obstacles = [{ x0: -0.5, x1: 0.5, z0: -1, z1: 0 }], people = {} } = {}) {
  const office = { current: { L: { W: 10, D: 8 }, zones: { door: { x: 0, z: 3.7 } } }, obstacles: () => obstacles };
  const staff = {
    people,
    charOf: (id) => (people[id] ? { probe: () => people[id] } : null),
    shown: (id) => !!people[id] && !people[id].hidden,
    positions: () => Object.values(people).filter((p) => !p.hidden).map((p) => ({ x: p.eyes.x, z: p.eyes.z })),
  };
  let autoExits = 0;
  const fp = createFirstPerson({ getOffice: () => office, getStaff: () => staff, onAutoExit: () => { autoExits++; } });
  return { fp, office, staff, exits: () => autoExits };
}

const person = (x, z, yaw = 0) => ({ eyes: new THREE.Vector3(x, 0.8, z), forward: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)) });

test('walk starts inside the door at eye height, facing into the room', () => {
  const { fp } = world();
  expect(fp.walk()).toBe(true);
  fp.step(1 / 60);
  expect(fp.mode).toBe('walk');
  expect(fp.camera.position.y).toBeCloseTo(0.82);
  expect(fp.camera.position.z).toBeCloseTo(3.7);
  const d = fp.camera.getWorldDirection(new THREE.Vector3());
  expect(d.z).toBeLessThan(-0.99);
});

test('walking into furniture stops a body radius short, and a wall the same', () => {
  const { fp } = world();
  fp.walk({ x: 0, z: 2, yaw: Math.PI });
  for (let i = 0; i < 300; i++) { fp.input({ moveZ: 1 }); fp.step(1 / 60); }
  expect(fp.camera.position.z).toBeGreaterThanOrEqual(0.2 - 1e-9);
  expect(fp.camera.position.z).toBeLessThan(0.25);
  fp.walk({ x: 3, z: 0, yaw: Math.PI / 2 });
  for (let i = 0; i < 300; i++) { fp.input({ moveZ: 1 }); fp.step(1 / 60); }
  expect(fp.camera.position.x).toBeLessThanOrEqual(4.8 + 1e-9);
  expect(fp.camera.position.x).toBeGreaterThan(4.7);
});

test('a blocked diagonal slides along the furniture instead of stopping', () => {
  const { fp } = world();
  fp.walk({ x: 0, z: 0.3, yaw: Math.PI });
  // Not long enough to clear the desk's end (0.5 m plus a body radius).
  for (let i = 0; i < 20; i++) { fp.input({ moveZ: 1, moveX: 1 }); fp.step(1 / 60); }
  expect(Math.abs(fp.camera.position.x)).toBeGreaterThan(0.3);
  expect(fp.camera.position.z).toBeGreaterThanOrEqual(0.2 - 1e-9);
});

test('people block a walker too', () => {
  const { fp } = world({ obstacles: [], people: { s1: person(0, 0) } });
  fp.walk({ x: 0, z: 2, yaw: Math.PI });
  for (let i = 0; i < 300; i++) { fp.input({ moveZ: 1 }); fp.step(1 / 60); }
  expect(fp.camera.position.z).toBeGreaterThanOrEqual(0.42 - 1e-9);
});

test('positive yaw turns right and positive pitch looks up, with pitch clamped', () => {
  const { fp } = world({ obstacles: [] });
  fp.walk({ x: 0, z: 0, yaw: 0 });
  fp.input({ yaw: Math.PI / 2 });
  fp.step(1 / 60);
  // Facing +z, a quarter turn right faces -x (three.js: right of +z is -x).
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeLessThan(-0.99);
  fp.input({ pitch: 5 });
  fp.step(1 / 60);
  expect(fp.walker.pitch).toBeCloseTo(1.05);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).y).toBeGreaterThan(0.8);
});

test('see-as sits just ahead of the eyes and looks where the head looks', () => {
  const { fp } = world({ people: { s1: person(1, 1, Math.PI / 2) } });
  expect(fp.seeAs('s1')).toBe(true);
  fp.step(1 / 60);
  expect(fp.camera.position.y).toBeCloseTo(0.8);
  expect(fp.camera.position.x).toBeCloseTo(1.07);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.99);
  // Not controllable: look and move input change nothing.
  fp.input({ yaw: 1, pitch: 0.5, moveZ: 1 });
  fp.step(1 / 60);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.99);
  expect(fp.camera.position.x).toBeCloseTo(1.07);
});

test('see-as refuses someone who is away, and ends by itself when they go', () => {
  const people = { s1: person(1, 1), s2: { ...person(2, 2), hidden: true } };
  const { fp, exits } = world({ people });
  expect(fp.seeAs('s2')).toBe(false);
  expect(fp.seeAs('nobody')).toBe(false);
  expect(fp.seeAs('s1')).toBe(true);
  delete people.s1;
  expect(fp.step(1 / 60)).toBe(false);
  expect(fp.mode).toBe('off');
  expect(exits()).toBe(1);
});

test('a new building ends first person by itself; exit() does not count as that', () => {
  const { fp, office, exits } = world();
  fp.walk();
  office.current = { ...office.current };
  expect(fp.step(1 / 60)).toBe(false);
  expect(exits()).toBe(1);
  fp.walk();
  fp.exit();
  expect(fp.mode).toBe('off');
  expect(exits()).toBe(1);
});
