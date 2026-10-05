import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Vector3 } from 'three';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';
import { bakeShot } from '../../scripts/tools/mocap/bake-lib.mjs';
import { judge, parseRule } from '../../blender/checks/mocap.mjs';

const CHECK = resolve(__dirname, '../../blender/checks/mocap.mjs');
const PIVOTS = { legL: [-0.073, 0.31, 0] };
const NAMES = ['Hips', 'Spine1', 'Spine2', 'Neck1', 'Neck2', 'Head', 'HeadEnd', 'LeftEye', 'RightEye', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftLeg', 'LeftShin', 'LeftFoot', 'LeftToeBase', 'RightLeg', 'RightShin', 'RightFoot', 'RightToeBase'];

// A synthetic person standing facing +z (anatomical left at +x); mod(t, pose) edits the pose.
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
function clipOf(name, mod, origin) {
  const frames = 12, joint_pos_world = [];
  for (let t = 0; t < frames; t++) { const pose = standing(); mod?.(t, pose); joint_pos_world.push(NAMES.map((n) => pose[n].toArray())); }
  const shot = {
    format: 'hitl-mocap-shot', version: 1, shot: { start_frame: 0, frames, fps: 30 }, joints: NAMES,
    people: [{ id: 0, observed: Array(frames).fill(1), trust: Array.from({ length: frames }, () => NAMES.map(() => 1)), joint_pos_world }],
  };
  const clip = bakeShot(shot, 0, { pivots: PIVOTS, name });
  if (origin) clip.origin = origin;
  return clip;
}

describe('rules', () => {
  it('reads a rule and judges the share of frames that meet it', () => {
    expect(parseRule('selfDepth<=0.03@0.9')).toMatchObject({ measure: 'selfDepth', op: '<=', value: 0.03, share: 0.9 });
    expect(parseRule('onScreen>=0.5').share).toBe(1);
    expect(() => parseRule('nonsense<1')).toThrow(/can't read rule/);
    expect(() => parseRule('selfDepth<=0.03@2')).toThrow(/share/);
    const rows = [0.01, 0.02, 0.2, null].map((v, i) => ({ id: 's1', frame: i, selfDepth: v }));
    const [v] = judge(rows, [parseRule('selfDepth<=0.03@0.6')], new Set());
    expect(v).toMatchObject({ n: 3, pass: true });
    expect(v.share).toBeCloseTo(2 / 3, 5);
    expect(judge(rows, [parseRule('selfDepth<=0.03@0.9')], new Set())[0].pass).toBe(false);
    expect(judge(rows, [parseRule('heightPx>=1')], new Set())).toEqual([]);
    expect(judge(rows, [parseRule('heightPx>=1')], new Set(['heightPx>=1']))[0]).toMatchObject({ pass: false, none: true });
  });
});

describe('mocap.mjs', () => {
  let dir;
  const file = (name, clip) => { const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify(clip)); return p; };
  const run = (args) => spawnAsync('node', [CHECK, ...args], { timeout: 180000 });
  beforeAll(() => { dir = mkdtempSync(join(toolTmp(), 'mocap-check-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('plays a still clip: feet on their points, no self-intersection, one person on screen', async () => {
    const r = await run(['--clip', file('still', clipOf('still')), '--frames', '0-11', '--json', join(dir, 'rows.json')]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/MOCAP ok\s+s\d+ contactMiss<=0.06@0.9/);
    expect(r.stdout).toMatch(/MOCAP ok\s+s\d+ selfDepth/);
    const rows = JSON.parse(readFileSync(join(dir, 'rows.json'), 'utf8'));
    expect(rows).toHaveLength(12);
    expect(rows.every((x) => x.contacts.length >= 2 && x.contactMiss < 0.06 && x.heightPx > 20)).toBe(true);
  }, 120000);

  it('fails two clips standing in one place, a person off screen, and a limb through the body', async () => {
    const same = { pos: [0, 0, 0], yaw: 0, scale: 1 };
    const a = file('a', clipOf('a', null, same)), b = file('b', clipOf('b', null, same));
    // The game eases people apart when their heads come closer than `apart`; with that off they overlap, with it on they do not.
    const [together, eased] = await Promise.all([run(['--clip', `${a},${b}`, '--frames', '0,6,11', '--shot', '{"apart":0}']), run(['--clip', `${a},${b}`, '--frames', '0,6,11'])]);
    expect(together.status, together.stdout).toBe(1);
    expect(together.stdout).toMatch(/MOCAP FAIL s\d+ pairDepth/);
    expect(eased.stdout).toMatch(/MOCAP ok\s+s\d+ pairDepth/);
    const away = await run(['--clip', a, '--frames', '0,6,11', '--camera', '0,60,0,0,60,-10', '--expect', 'onScreen>=0.9@0.9']);
    expect(away.status, away.stdout).toBe(1);
    expect(away.stdout).toMatch(/MOCAP FAIL s\d+ onScreen/);
    // The anatomical right hand brought through the body: the rig's L arm in the torso.
    const through = file('through', clipOf('through', (t, p) => { p.RightHand = new Vector3(0.02, 1.2, -0.1); p.RightForeArm = new Vector3(-0.07, 1.325, -0.05); }));
    const crossed = await run(['--clip', through, '--frames', '0,6,11']);
    expect(crossed.status, crossed.stdout).toBe(1);
    expect(crossed.stdout).toMatch(/MOCAP FAIL s\d+ selfDepth<=0.03@1/);
    expect(crossed.stdout).toMatch(/selfDepth max 0\.0[4-9]\d* \(armL~torso/);
  }, 240000);

  it('stages the gaps with --spread: close origins overlap at 1, clear at 8 (head spacing off)', async () => {
    const a = file('sa', clipOf('sa', null, { pos: [0, 0, 0], yaw: 0, scale: 1 })), b = file('sb', clipOf('sb', null, { pos: [0.2, 0, 0], yaw: 0, scale: 1 }));
    const [tight, wide] = await Promise.all([run(['--clip', `${a},${b}`, '--frames', '0,6', '--spread', '1', '--shot', '{"apart":0}']), run(['--clip', `${a},${b}`, '--frames', '0,6', '--spread', '8', '--shot', '{"apart":0}'])]);
    expect(tight.stdout).toMatch(/MOCAP FAIL s\d+ pairDepth/);
    expect(wide.stdout).toMatch(/MOCAP ok\s+s\d+ pairDepth/);
    const bad = await run(['--clip', a, '--spread', '0']);
    expect(bad.status).toBe(2);
    for (const shot of ['nope', '[1]']) expect((await run(['--clip', a, '--shot', shot])).status).toBe(2);
    const passed = await run(['--clip', a, '--frames', '0,3', '--shot', '{"apart":0.8}']);
    expect(passed.status, passed.stdout + passed.stderr).toBe(0);
  }, 240000);

  it('refuses bad input with a usage line', async () => {
    const wrong = file('wrong', { format: 'x' });
    for (const args of [[], ['--clip', join(dir, 'missing.json')], ['--clip', wrong], ['--clip', file('ok', clipOf('ok')), '--expect', 'bogus<1'], ['--clip', file('ok', clipOf('ok')), '--frames', 'x'], ['--clip', file('ok', clipOf('ok')), '--mock', 'nowhere'], ['--clip', file('ok', clipOf('ok')), '--camera', '1,2']]) {
      const r = await run(args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/mocap: /);
    }
  }, 120000);
});
