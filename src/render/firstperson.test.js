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
  expect(fp.camera.near).toBeCloseTo(0.04);
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
  // A partition brushed past is clipped rather than filling the lens; walk mode sees close up.
  expect(fp.camera.near).toBeCloseTo(0.2);
  // Not controllable: look and move input change nothing.
  fp.input({ yaw: 1, pitch: 0.5, moveZ: 1 });
  fp.step(1 / 60);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.99);
  expect(fp.camera.position.x).toBeCloseTo(1.07);
});

test('see-as, walking, looks down the path ahead rather than at a wall the head swings past', () => {
  // Walking +x, the path turns to +z 0.4 m ahead; the head points straight at -z (a wall).
  const people = { s1: person(0, 0, Math.PI) };
  const { fp, staff } = world({ obstacles: [], people });
  staff.walkOf = () => ({ path: [{ x: 0.4, z: 0 }, { x: 0.4, z: 3 }] });
  fp.seeAs('s1');
  fp.step(1 / 60);
  const d = fp.camera.getWorldDirection(new THREE.Vector3());
  // 1.2 m along: 0.4 m east then 0.8 m north, so the view points north-east, never south at the wall.
  expect(d.z).toBeGreaterThan(0.8);
  expect(d.x).toBeGreaterThan(0.3);
  // Stopped a metre short of the spot (a sitter behind the chair), it holds the spot's facing while
  // the head swings round, rather than following the head past the wall beside the desk.
  staff.walkOf = () => ({ path: [], temp: { goal: { x: 1, z: 0, yaw: Math.PI / 2 } } });
  for (let i = 0; i < 120; i++) fp.step(1 / 60);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.99);
  // At the spot, the same.
  staff.walkOf = () => ({ path: [], temp: { goal: { x: 0.1, z: 0, yaw: Math.PI / 2 } } });
  for (let i = 0; i < 120; i++) fp.step(1 / 60);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.99);
  // Standing still, it looks where the head looks.
  staff.walkOf = () => ({ path: [] });
  for (let i = 0; i < 120; i++) fp.step(1 / 60);
  expect(fp.camera.getWorldDirection(new THREE.Vector3()).z).toBeLessThan(-0.99);
});

test('see-as leaves out anyone right by the eye, further while walking or off to the side; walk mode never does', () => {
  // Looking +x: s2 is 0.33 m from the eye, s3 0.73 m ahead, s4 1.9 m ahead, s5 0.7 m off to the left.
  const people = { s1: person(0, 0, Math.PI / 2), s2: person(0.4, 0.1), s3: person(0.8, 0), s4: person(2, 0), s5: person(0.07, 0.7) };
  const { fp, staff } = world({ obstacles: [], people });
  staff.charsNear = (x, z, r, except) => Object.entries(people)
    .map(([id, p]) => ({ char: id, d: Math.hypot(p.eyes.x - x, p.eyes.z - z), x: p.eyes.x, z: p.eyes.z }))
    .filter((n) => n.char !== except && n.d < r);
  // The first one left out is always the person seen through; the rest are passers-by.
  const others = () => {
    const [self, ...rest] = fp.tooClose();
    expect(self.probe().eyes).toBe(people.s1.eyes);
    return rest;
  };
  fp.seeAs('s1');
  fp.step(1 / 60);
  // Standing (a chat): the one at the eye and the one at the edge of the view, not the partner ahead.
  expect(others()).toEqual(['s2', 's5']);
  // Walking: the one a stride ahead too.
  staff.walkOf = () => ({ path: [{ x: 3, z: 0 }] });
  fp.step(1 / 60);
  expect(others()).toEqual(['s2', 's3', 's5']);
  // Left out, s3 stays out a little past the reach rather than blinking back.
  people.s3 = person(0.07 + 0.95, 0);
  fp.step(1 / 60);
  expect(others()).toContain('s3');
  people.s3 = person(0.07 + 1.1, 0);
  fp.step(1 / 60);
  expect(others()).not.toContain('s3');
  fp.walk({ x: 0, z: 1, yaw: 0 });
  fp.step(1 / 60);
  expect(fp.tooClose()).toEqual([]);
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
