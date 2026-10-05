import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createMocapPlayer } from './mocap.js';

const BONES = ['body', 'hips', 'legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const HIP_Y = 0.3;

// A bare rig with the chibi's pivot chain, and a drive() that applies a pose as character.js does.
function fakeChar() {
  const root = new THREE.Group();
  const g = Object.fromEntries(BONES.map((b) => [b, new THREE.Group()]));
  root.add(g.body); g.body.add(g.hips); g.hips.position.y = HIP_Y;
  g.hips.add(g.legL, g.legR, g.torso); g.legL.position.x = -0.06; g.legR.position.x = 0.06;
  g.torso.add(g.head, g.armL, g.armR); g.head.position.y = 0.3; g.armL.position.set(-0.18, 0.24, 0); g.armR.position.set(0.18, 0.24, 0);
  let driven = null;
  return {
    root, pivots: g,
    drive(p) { driven = p; },
    update() {
      if (!driven) return;
      for (const k in driven.q) g[k].quaternion.copy(driven.q[k]);
      g.body.position.copy(driven.pos);
      root.updateMatrixWorld(true);
      driven.after?.(g);
      root.updateMatrixWorld(true);
    },
    get driven() { return driven; },
  };
}

const ident = [0, 0, 0, 1];
const turnX = (a) => { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a); return [q.x, q.y, q.z, q.w]; };
function clipOf(frames, { legL = () => ident, pos = () => [0, 0, 0], conf = null, contacts = [] } = {}) {
  const tracks = Object.fromEntries(BONES.map((b) => [b, { quat: Array.from({ length: frames }, (_, i) => (b === 'legL' ? legL(i) : ident)) }]));
  tracks.body.pos = Array.from({ length: frames }, (_, i) => pos(i));
  return { format: 'hitl-mocap-clip', version: 1, fps: 30, frames, bones: BONES, tracks, conf, contacts };
}
const footOf = (c, k) => { const l = c.pivots[k]; const e = new THREE.Vector3(0, -HIP_Y, 0); return l.localToWorld(e); };

describe('mocap player', () => {
  it('slerps between frames on an outside clock', () => {
    const c = fakeChar();
    const p = createMocapPlayer(c, clipOf(3, { legL: (i) => turnX(i * 0.4) }));
    p.setTime(1.5 / 30); c.update();
    const q = c.pivots.legL.quaternion;
    expect(2 * Math.acos(Math.min(1, Math.abs(q.w)))).toBeCloseTo(0.6, 3);
    p.setTime(0); c.update();
    expect(c.pivots.legL.quaternion.w).toBeCloseTo(1, 6);
  });

  it('holds the nearest trusted frame through low-confidence frames', () => {
    const c = fakeChar();
    const conf = Object.fromEntries(BONES.map((b) => [b, [1, 0, 0, 1]]));
    const p = createMocapPlayer(c, clipOf(4, { legL: (i) => turnX([0.2, 1.5, -1.5, 0.4][i]), conf }));
    p.setTime(1 / 30); c.update();
    expect(2 * Math.acos(Math.min(1, c.pivots.legL.quaternion.w))).toBeCloseTo(0.2, 3);
    p.setTime(0.4 / 30 * 0 + 2 / 30); c.update();
    expect(2 * Math.acos(Math.min(1, c.pivots.legL.quaternion.w))).toBeCloseTo(0.2, 3);
  });

  it('pins a planted foot on its point while the hips travel', () => {
    const c = fakeChar();
    c.root.position.set(2, 0, 1); c.root.rotation.y = 0.7;
    // The body walks 0.3 m forward over the contact; the foot should stay put.
    const point = [-0.06, 0, 0.05];
    const clip = clipOf(20, { pos: (i) => [0, 0, i * 0.015], contacts: [{ limb: 'footL', from: 0, to: 20, point }] });
    const p = createMocapPlayer(c, clip, { ramp: 0 });
    const want = c.root.localToWorld(new THREE.Vector3(...point));
    for (const f of [0, 5, 10, 19]) {
      p.setTime(f / 30); c.update();
      const got = footOf(c, 'legL');
      expect(Math.hypot(got.x - want.x, got.z - want.z)).toBeLessThan(0.01);
    }
  });

  it('leaves the pose alone outside contacts and with ik off', () => {
    const c = fakeChar();
    const clip = clipOf(30, { pos: (i) => [0, 0, i * 0.02], contacts: [{ limb: 'footL', from: 0, to: 5, point: [-0.06, 0, 0] }] });
    const p = createMocapPlayer(c, clip, { ramp: 3 });
    p.setTime(20 / 30); c.update();
    expect(c.pivots.body.position.z).toBeCloseTo(0.4, 6);
    expect(c.pivots.legL.quaternion.w).toBeCloseTo(1, 6);
    const off = fakeChar();
    createMocapPlayer(off, clip, { ik: false }).setTime(2 / 30); off.update();
    expect(off.pivots.body.position.z).toBeCloseTo(0.04, 6);
  });

  it('hands the pivots back on stop', () => {
    const c = fakeChar();
    const p = createMocapPlayer(c, clipOf(2));
    p.setTime(0);
    expect(c.driven).not.toBeNull();
    p.stop();
    expect(c.driven).toBeNull();
  });
});
