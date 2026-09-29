import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseMatrix, cellsOf, parseRule, judgeCell, margin, worstOf, formatMatrix, valueOf } from '../../blender/checks/pose-matrix.js';

const POSE = resolve(__dirname, '../../blender/checks/pose.mjs');
const run = (...args) => spawnSync(process.execPath, [POSE, ...args], { encoding: 'utf8', timeout: 180000 });

const frame = (t, cover, faceCam = 10, phase = 'gesture') => ({ t, phase, faceCam, contact: { hand0Head: 0.1, hand1Head: 0.3 }, cover: { coverHandEyeNear: cover } });

describe('pose matrix parsing', () => {
  it('expands all and lists, one cell per combination', () => {
    const a = parseMatrix('views=all,postures=stand,sit,builds=0,2,rig=on');
    expect(a).toMatchObject({ views: [0, 1, 2, 3], postures: ['stand', 'sit'], builds: [0, 2], rig: ['on'], accessory: ['none'] });
    expect(cellsOf(a)).toHaveLength(4 * 2 * 2 * 1);
    expect(cellsOf(parseMatrix('')).length).toBe(4 * 3 * 3 * 2);
  });

  it('refuses an unknown axis or value', () => {
    expect(() => parseMatrix('view=0')).toThrow(/axis/);
    expect(() => parseMatrix('postures=fly')).toThrow(/posture/);
    expect(() => parseMatrix('builds=3')).toThrow(/builds/);
    expect(() => parseMatrix('views=4')).toThrow(/views/);
  });

  it('reads rules with a share and an if condition, and adds the measures they name', () => {
    const measures = ['coverHandEyeNear'];
    const r = parseRule('coverHandEyeNear>=0.5@0.7 if faceCam<=80', measures);
    expect(r).toMatchObject({ measure: 'coverHandEyeNear', op: '>=', value: 0.5, share: 0.7, when: { measure: 'faceCam', op: '<=', value: 80 } });
    expect(measures).toContain('faceCam');
    expect(() => parseRule('nonsense', measures)).toThrow(/can't read/);
  });
});

describe('pose matrix judging', () => {
  const measures = ['coverHandEyeNear', 'faceCam'];
  const rule = () => parseRule('coverHandEyeNear>=0.5@0.5 if faceCam<=80', [...measures]);

  it('judges the share of gesture frames that hold and ignores warm-up frames', () => {
    const frames = [frame(0.1, 0, 10, 'warm'), frame(1, 0.9), frame(1.1, 0.8), frame(1.2, 0.1), frame(1.3, 0.2)];
    const c = judgeCell(frames, [rule()], measures);
    expect(c.judged).toBe(4);
    expect(c.verdicts[0]).toMatchObject({ share: 0.5, pass: true });
    expect(c.stat.coverHandEyeNear).toEqual({ min: 0.1, median: 0.8, max: 0.9 });
  });

  it('drops frames the condition rules out, and passes a cell with none left', () => {
    const turned = [frame(1, 0, 120), frame(1.1, 0, 130)];
    expect(judgeCell(turned, [rule()], measures)).toMatchObject({ pass: true });
    const mixed = [frame(1, 0, 120), frame(1.1, 0.9, 20)];
    expect(judgeCell(mixed, [rule()], measures).verdicts[0].share).toBe(1);
  });

  it('reads clearance as the smaller hand-to-head distance', () => {
    expect(valueOf(frame(1, 0), 'clearance')).toBe(0.1);
  });

  it('marks the cell with the lowest share as worst, and breaks ties by how far its best frame is', () => {
    const r = parseRule('coverHandEyeNear>=0.5@0.7', ['coverHandEyeNear']);
    const near = { view: 0, ...judgeCell([frame(1, 0.4), frame(1.1, 0.45)], [r], ['coverHandEyeNear']) };
    const far = { view: 1, ...judgeCell([frame(1, 0), frame(1.1, 0.05)], [r], ['coverHandEyeNear']) };
    const good = { view: 2, ...judgeCell([frame(1, 0.9), frame(1.1, 0.9)], [r], ['coverHandEyeNear']) };
    expect(margin(near)).toBe(margin(far));
    expect(worstOf([good, near, far])).toBe(far);
    expect(margin(good)).toBeGreaterThan(0);
  });

  it('prints one grid per rule, stars failures and names the worst cell', () => {
    const axes = parseMatrix('views=0,1,postures=stand,builds=1,rig=on');
    const r = parseRule('coverHandEyeNear>=0.5@0.7', ['coverHandEyeNear']);
    const cells = cellsOf(axes).map((c) => ({ ...c, ...judgeCell([frame(1, c.view ? 0 : 0.9)], [r], ['coverHandEyeNear']) }));
    const text = formatMatrix({ axes, cells }, [r], 'facepalm').join('\n');
    expect(text).toContain('MATRIX facepalm: 1 of 2 cells pass');
    expect(text).toMatch(/stand b1 rig on\s+100%\s+0%\*</);
    expect(text).toContain('MATRIX worst cell: stand b1 rig on view 1');
  });
});

describe('pose.mjs --matrix', () => {
  const base = ['--gesture', 'facepalm', '--matrix', 'views=0,postures=stand,builds=1,rig=on', '--measure', 'coverHandEyeNear,faceCam,clearance'];

  it('passes and fails by exit code, and a broken palm fails where the shipped one passes', () => {
    const ok = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7');
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain('MATRIX facepalm: 1 of 1 cells pass');
    const broken = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--param', 'PALM_STAND=[-2.75,0.14,0.9,-0.6,0.08]');
    expect(broken.status, broken.stdout + broken.stderr).toBe(1);
    expect(broken.stdout).toContain('MATRIX worst cell: stand b1 rig on view 0');
  });

  it('answers which swept value passes every cell', () => {
    const r = run(...base, '--expect', 'coverHandEyeNear>=0.5@0.7', '--sweep', 'PALM_STAND[2]=0.27,0.9');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/PALM_STAND\[2\]=0\.27\s+1 of 1\s+ALL PASS/);
    expect(r.stdout).toMatch(/PALM_STAND\[2\]=0\.9\s+0 of 1\s+worst/);
    expect(r.stdout).toContain('SWEEP passing every cell: PALM_STAND[2]=0.27');
  });

  it('needs a gesture and a measure', () => {
    expect(run('--matrix', 'views=0', '--measure', 'faceCam').status).toBe(2);
    expect(run('--gesture', 'facepalm', '--matrix', 'views=0').status).toBe(2);
  });
});
