import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';
import { bakeShot } from '../../scripts/tools/mocap/bake-lib.mjs';

const BAKE = resolve(__dirname, '../../scripts/tools/mocap/bake.mjs');
const PIVOTS = { legL: [-0.073, 0.31, 0] };
const NAMES = ['Hips', 'Spine1', 'Spine2', 'Neck1', 'Neck2', 'Head', 'HeadEnd', 'LeftEye', 'RightEye', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftLeg', 'LeftShin', 'LeftFoot', 'LeftToeBase', 'RightLeg', 'RightShin', 'RightFoot', 'RightToeBase'];

// A person standing facing +z (anatomical left at +x), metres, feet on y = 0. mod(t, pose) edits the pose.
function standing() {
  const p = {
    Hips: [0, 0.95, 0], Spine1: [0, 1.05, 0], Spine2: [0, 1.2, 0], Neck1: [0, 1.5, 0], Neck2: [0, 1.55, 0], Head: [0, 1.6, 0], HeadEnd: [0, 1.8, 0],
    LeftEye: [0.03, 1.7, 0.08], RightEye: [-0.03, 1.7, 0.08],
    LeftArm: [0.18, 1.45, 0], LeftForeArm: [0.18, 1.2, 0], LeftHand: [0.18, 0.95, 0],
    RightArm: [-0.18, 1.45, 0], RightForeArm: [-0.18, 1.2, 0], RightHand: [-0.18, 0.95, 0],
    LeftLeg: [0.09, 0.92, 0], LeftShin: [0.09, 0.5, 0], LeftFoot: [0.09, 0.08, 0], LeftToeBase: [0.09, 0.02, 0.1],
    RightLeg: [-0.09, 0.92, 0], RightShin: [-0.09, 0.5, 0], RightFoot: [-0.09, 0.08, 0], RightToeBase: [-0.09, 0.02, 0.1],
  };
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, new Vector3(...v)]));
}
function shotOf(frames, fps, mod) {
  const joint_pos_world = [];
  for (let t = 0; t < frames; t++) {
    const pose = standing();
    mod?.(t, pose);
    joint_pos_world.push(NAMES.map((n) => pose[n].toArray()));
  }
  return {
    format: 'hitl-mocap-shot', version: 1, shot: { start_frame: 100, frames, fps }, joints: NAMES,
    people: [{ id: 3, observed: Array(frames).fill(1), trust: Array.from({ length: frames }, () => NAMES.map(() => 1)), joint_pos_world }],
  };
}
const rotateAll = (pose, q, about = new Vector3()) => { for (const k of Object.keys(pose)) pose[k] = pose[k].clone().sub(about).applyQuaternion(q).add(about); };
const yawQ = (deg) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (deg * Math.PI) / 180);
const angle = (q) => 2 * Math.acos(Math.min(1, Math.abs(q[3])));

describe('bakeShot', () => {
  it('bakes a still standing person to identity rotations and no motion', () => {
    const c = bakeShot(shotOf(30, 30), 3, { pivots: PIVOTS, name: 'still', shotIndex: 2 });
    expect(c).toMatchObject({ format: 'hitl-mocap-clip', version: 1, name: 'still', fps: 30, frames: 30, source: { shot: 2, trackId: 3, start: 100, end: 130 } });
    for (const b of c.bones) for (const q of c.tracks[b].quat) expect(angle(q)).toBeLessThan(1e-3);
    expect(Math.max(...c.tracks.body.pos.flat().map(Math.abs))).toBeLessThan(1e-4);
    expect(c.scale).toBeCloseTo(0.31 / (0.84 + 0.08), 2);
    expect(c.contacts.map((k) => k.limb).sort()).toEqual(['footL', 'footR']);
  });

  it('puts a turn in the body bone and a facing at frame 0 of any heading in nothing', () => {
    const turned = bakeShot(shotOf(30, 30, (t, p) => rotateAll(p, yawQ(90 + t * 3), p.Hips.clone())), 3, { pivots: PIVOTS });
    expect(angle(turned.tracks.hips.quat[0])).toBeLessThan(1e-3);
    expect(angle(turned.tracks.body.quat[0])).toBeLessThan(1e-3);
    const last = turned.tracks.body.quat[29];
    expect(angle(last)).toBeCloseTo((29 * 3 * Math.PI) / 180, 2);
    expect(angle(turned.tracks.hips.quat[29])).toBeLessThan(1e-3);
  });

  it('maps a raised anatomical left arm to the rig R arm and the right arm to L', () => {
    const c = bakeShot(shotOf(10, 30, (t, p) => { p.LeftHand = new Vector3(0.18 + 0.25, 1.45, 0); p.LeftForeArm = new Vector3(0.18 + 0.12, 1.45, 0); }), 3, { pivots: PIVOTS });
    expect(angle(c.tracks.armR.quat[5])).toBeCloseTo(Math.PI / 2, 2);
    expect(angle(c.tracks.armL.quat[5])).toBeLessThan(1e-3);
  });

  it('measures a bent knee and resamples to 30 fps with a stated frame range', () => {
    const c = bakeShot(shotOf(60, 60, (t, p) => { p.LeftFoot = new Vector3(0.09, 0.5, 0.42); }), 3, { pivots: PIVOTS, from: 10, to: 50 });
    expect(c.frames).toBe(Math.round((39 / 60) * 30) + 1);
    expect(c.source).toMatchObject({ start: 110, end: 150 });
    expect(c.bend.legR[3]).toBeGreaterThan(0.5);
    expect(c.bend.legL[3]).toBeLessThan(0.01);
  });

  it('finds a planted foot and a raised held hand, not a swinging foot or a hanging hand', () => {
    const c = bakeShot(shotOf(40, 30, (t, p) => {
      p.RightFoot = new Vector3(-0.09, 0.08 + 0.2 * Math.abs(Math.sin(t / 3)), 0); p.RightToeBase = p.RightFoot.clone().add(new Vector3(0, -0.06, 0.1));
      p.LeftHand = new Vector3(0.45, 1.2, 0.2); p.LeftForeArm = new Vector3(0.3, 1.3, 0.1);
    }), 3, { pivots: PIVOTS });
    const limbs = c.contacts.map((k) => k.limb);
    expect(limbs).toContain('footR'); // the planted anatomical left foot is the rig R limb
    expect(limbs).toContain('handR');
    expect(limbs).not.toContain('handL');
    const f = c.contacts.find((k) => k.limb === 'footR');
    expect(f.to - f.from).toBe(40);
  });

  it('reports an unknown person and a missing joint plainly', () => {
    expect(() => bakeShot(shotOf(10, 30), 9, { pivots: PIVOTS })).toThrow(/no person 9/);
    const s = shotOf(10, 30);
    s.joints = s.joints.filter((n) => n !== 'HeadEnd');
    expect(() => bakeShot(s, 3, { pivots: PIVOTS })).toThrow(/no joint HeadEnd/);
  });
});

describe('bake.mjs', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(toolTmp(), 'bake-'));
    writeFileSync(join(dir, 'shot-4.json'), JSON.stringify(shotOf(20, 30)));
    writeFileSync(join(dir, 'other.json'), '{"format":"x"}');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('bakes every person into a directory, reading the pivots from the rig model', async () => {
    const r = await spawnAsync('node', [BAKE, '--shot', join(dir, 'shot-4.json'), '--out', join(dir, 'clips')], { timeout: 60000 });
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(join(dir, 'clips'))).toEqual(['shot-4_p3.json']);
    const c = JSON.parse(readFileSync(join(dir, 'clips', 'shot-4_p3.json'), 'utf8'));
    expect(c.source.shot).toBe(4);
    expect(JSON.stringify(c)).not.toContain(dir);
  });

  it('refuses a missing option, a wrong file and an unknown person with a usage line', async () => {
    for (const args of [[], ['--shot', join(dir, 'other.json'), '--out', join(dir, 'x.json')], ['--shot', join(dir, 'shot-4.json'), '--out', join(dir, 'y.json'), '--person', '9']]) {
      const r = await spawnAsync('node', [BAKE, ...args], { timeout: 60000 });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/bake: /);
    }
  });
});
