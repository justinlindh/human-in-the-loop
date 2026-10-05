import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join, resolve } from 'node:path';
import { spawnAsync } from './spawn-async.js';

const POSE = resolve(__dirname, '../../blender/checks/pose.mjs');
const run = (...args) => spawnAsync(process.execPath, [POSE, ...args]);
const base = ['--gesture', 'slap', '--matrix', 'views=0,postures=stand,builds=0,1,rig=on', '--measure', 'robotContact,robotDepth,robotAngle',
  '--expect', 'robotContact<=0.06@0.01', '--expect', 'robotDepth<=0.01', '--expect', 'robotAngle<=35@0.8'];

// The cases are independent processes, so they run side by side.
describe.concurrent('pose.mjs --gesture slap', () => {
  it('plays the fixer and the robot at the game slap spot and passes the shipped constants', async () => {
    const r = await run(...base);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('MATRIX slap: 2 pass, 0 fail, 0 n/a (2 cells)');
  });

  it('fails a slap whose fixer stands inside the robot, through a --param on the game constant', async () => {
    const r = await run(...base, '--param', 'src/render/robot.js:SLAP.aside=0.5');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/robotDepth<=0\.01/);
  });

  it('pins the fixer turn with the stage facing rule: a fixer squared far off the robot fails robotAngle', async () => {
    const [far, near] = await Promise.all([run(...base, '--param', 'src/render/robot.js:SLAP.aside=0.8'), run(...base, '--param', 'src/render/robot.js:SLAP.aside=0.2')]);
    expect(far.status, far.stdout + far.stderr).toBe(1);
    expect(far.stdout).toMatch(/worst cell.*robotAngle<=35@0\.8: 0%/);
    expect(near.status).toBe(0);
  });

  it('holds the robot in its breakdown pose: an unplugged robot leaves less room than an upright one', async () => {
    const at = (cause) => run(...base.map((a) => (a.startsWith('views=') ? `${a},cause=${cause}` : a)), '--param', 'src/render/robot.js:SLAP.aside=0.3');
    const [none, r] = await Promise.all([at('none'), at('unplug')]);
    expect(none.status).toBe(0);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/robotDepth<=0\.01/);
  });

  it('reads the hand landing on the robot head within the stage rule', async () => {
    const dir = mkdtempSync(join(toolTmp(), 'slaptest-')), out = join(dir, 'm.json');
    const r = await run('--gesture', 'slap', '--matrix', 'views=0,postures=stand,builds=1,rig=on', '--measure', 'robotContact,robotAngle', '--json', out);
    expect(r.status, r.stderr).toBe(0);
    const cell = JSON.parse(readFileSync(out, 'utf8')).cells[0];
    rmSync(dir, { recursive: true, force: true });
    expect(cell.stat.robotContact.min).toBeLessThanOrEqual(0.06);
    expect(cell.judged).toBeGreaterThan(20);
  });
});
