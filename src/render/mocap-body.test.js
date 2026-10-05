import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { limitJoint, bodyShape, restAllowance, pushOut } from './mocap-body.js';

const swingOf = (q) => Math.acos(Math.max(-1, Math.min(1, -new THREE.Vector3(0, -1, 0).applyQuaternion(q).y)));
const turn = (axis, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), a);

describe('joint limits', () => {
  it('clamps swing to its cone and leaves smaller turns alone', () => {
    const q = turn([1, 0, 0], 2.4);
    limitJoint(q, { swing: 1.5, twist: 0.5 });
    expect(swingOf(q)).toBeCloseTo(1.5, 4);
    const small = turn([1, 0, 0], 0.6), before = small.clone();
    limitJoint(small, { swing: 1.5, twist: 0.5 });
    expect(small.angleTo(before)).toBeLessThan(1e-6);
  });

  it('clamps twist about the bone axis', () => {
    const q = turn([0, 1, 0], 1.2);
    limitJoint(q, { swing: 1.5, twist: 0.4 });
    expect(2 * Math.acos(Math.min(1, Math.abs(q.w)))).toBeCloseTo(0.4, 4);
  });

  it('keeps a leg from crossing past the midline', () => {
    // A leg on the -x side swung toward +x (a turn about +z moves the foot to +x... about -z).
    const q = turn([0, 0, 1], 0.9);
    const foot = () => new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    expect(foot().x).toBeGreaterThan(0.5);
    limitJoint(q, { swing: 1.75, twist: 0.5, cross: 0.2 }, -1);
    expect(foot().x).toBeCloseTo(0.2, 4);
  });
});

// A torso box and an arm stick on their pivots, tagged as character.js tags baked parts.
function body() {
  const root = new THREE.Group();
  const pv = { torso: new THREE.Group(), head: new THREE.Group(), armL: new THREE.Group() };
  root.add(pv.torso); pv.torso.add(pv.head, pv.armL);
  pv.torso.position.y = 0.3; pv.head.position.y = 0.35; pv.armL.position.set(-0.17, 0.25, 0);
  const mesh = (geo, part, y) => { const m = new THREE.Mesh(geo); m.position.y = y; m.userData.part = part; return m; };
  pv.torso.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), 'torso', 0.15));
  pv.head.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), 'head', 0.2));
  pv.armL.add(mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), 'armL', -0.11));
  root.updateMatrixWorld(true);
  return { root, pv };
}
const tipOf = (pv) => new THREE.Vector3(0, -0.2, 0).applyMatrix4(pv.armL.matrixWorld);

describe('push-out', () => {
  it('turns an arm swung into the torso back out, and leaves the rest pose alone', () => {
    const { root, pv } = body();
    const shape = bodyShape(pv);
    restAllowance(shape);
    pushOut(shape);
    expect(pv.armL.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    // Swing the arm across the chest: its tip lands inside the torso.
    pv.armL.quaternion.copy(turn([0, 0, 1], 1.2));
    root.updateMatrixWorld(true);
    expect(tipOf(pv).x).toBeGreaterThan(-0.15);
    const left = pushOut(shape);
    root.updateMatrixWorld(true);
    expect(left).toBeLessThan(0.01);
    // The tip ends outside the torso's side (x <= -0.15 less the arm's radius) or below it.
    const tip = tipOf(pv);
    expect(tip.x <= -0.15 + 0.01 || tip.y <= 0.3 + 0.01).toBe(true);
  });

  it('pushes nothing at zero weight', () => {
    const { root, pv } = body();
    const shape = bodyShape(pv);
    restAllowance(shape);
    pv.armL.quaternion.copy(turn([0, 0, 1], 1.2));
    root.updateMatrixWorld(true);
    pushOut(shape, () => 0);
    expect(pv.armL.quaternion.angleTo(turn([0, 0, 1], 1.2))).toBeLessThan(1e-6);
  });
});
