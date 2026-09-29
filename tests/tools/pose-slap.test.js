import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const POSE = resolve(__dirname, '../../blender/checks/pose.mjs');
const run = (...args) => spawnSync(process.execPath, [POSE, ...args], { encoding: 'utf8', timeout: 180000 });
const base = ['--gesture', 'slap', '--matrix', 'views=0,postures=stand,builds=0,1,rig=on', '--measure', 'robotContact,robotDepth,robotAngle',
  '--expect', 'robotContact<=0.06@0.01', '--expect', 'robotDepth<=0.01', '--expect', 'robotAngle<=35@0.8'];

describe('pose.mjs --gesture slap', () => {
  it('plays the fixer and the robot at the game slap spot and passes the shipped constants', () => {
    const r = run(...base);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('MATRIX slap: 2 pass, 0 fail, 0 n/a (2 cells)');
  });

  it('fails a slap whose fixer stands inside the robot, through a --param on the game constant', () => {
    const r = run(...base, '--param', 'src/render/robot.js:SLAP.aside=0.5');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/robotDepth<=0\.01/);
  });

  it('reads the hand landing on the robot head within the stage rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slaptest-')), out = join(dir, 'm.json');
    const r = run('--gesture', 'slap', '--matrix', 'views=0,postures=stand,builds=1,rig=on', '--measure', 'robotContact,robotAngle', '--json', out);
    expect(r.status, r.stderr).toBe(0);
    const cell = JSON.parse(readFileSync(out, 'utf8')).cells[0];
    rmSync(dir, { recursive: true, force: true });
    expect(cell.stat.robotContact.min).toBeLessThanOrEqual(0.06);
    expect(cell.judged).toBeGreaterThan(20);
  });
});
