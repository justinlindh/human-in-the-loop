import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLIP = resolve(__dirname, '../../scripts/studio/clip.mjs');
const run = (...args) => spawnSync(process.execPath, [CLIP, ...args], { encoding: 'utf8', timeout: 240000 });

describe('studio clip', () => {
  it('leaves the rig to the quality setting, as a page with no rig parameter does', () => {
    const script = `const { createRuntime } = await import(${JSON.stringify(resolve(__dirname, '../../scripts/studio/runtime.mjs'))});
      const rt = await createRuntime({ quality: 'low', initialSync: false });
      const { rigEnabled } = await import(${JSON.stringify(resolve(__dirname, '../../src/render/rig.js'))});
      const low = rigEnabled(); rt.R.setQuality('medium');
      console.log(JSON.stringify({ low, medium: rigEnabled() })); process.exit(0);`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 120000 });
    expect(r.stdout.trim().split('\n').pop(), r.stderr).toBe('{"low":false,"medium":true}');
  }, 130000);

  it('stops its group processes when interrupted', async () => {
    // The driver's own children, by pid: nothing else on the machine can be mistaken for them.
    const child = spawn(process.execPath, [CLIP, '--jobs', '2', '--group', 'seats,perks'], { stdio: 'ignore' });
    const kids = () => spawnSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
    let running = [];
    for (let i = 0; i < 200 && !running.length; i++) { await new Promise((r) => setTimeout(r, 50)); running = kids(); }
    expect(running.length).toBeGreaterThan(0);
    child.kill('SIGTERM');
    const { code, signal } = await closed;
    expect(code === 143 || signal === 'SIGTERM').toBe(true);
    for (let i = 0; i < 60 && running.some(alive); i++) await new Promise((r) => setTimeout(r, 50));
    expect(running.filter(alive)).toEqual([]);
  }, 60000);

  it('refuses a group it does not run', () => {
    const r = run('--group', 'sky');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown group sky');
    expect(r.stderr).toContain('sky runs in the browser');
  });

  it('plays the groups that open their own scene, the garage on the garage mock', () => {
    const r = run('--group', 'control,garage', '--jobs', '2');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/CLIP ok {3}control:head-through-slab \{"vertexShare":0,"exactShare":0\.\d+\}/);
    expect(r.stdout).toMatch(/CLIP ok {3}pairs:garage \{"staff":2,/);
  }, 260000);

  it('runs every group but sky through blender/checks/clip.mjs with no browser when --only skips sky', () => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../blender/checks/clip.mjs'), '--only=control'], { encoding: 'utf8', timeout: 240000, env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/with-render-lock|harness: GL/);
    expect(r.stdout).toContain('clip: 1 of 1 passed (--only=control)');
  }, 260000);

  it('blender/checks/clip.mjs stops its engine groups when interrupted', async () => {
    const child = spawn(process.execPath, [resolve(__dirname, '../../blender/checks/clip.mjs'), '--only=desk:,couch', '--jobs=2'], { stdio: 'ignore', env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
    const kids = () => spawnSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
    let running = [];
    for (let i = 0; i < 200 && running.length < 2; i++) { await new Promise((r) => setTimeout(r, 50)); running = kids(); }
    expect(running.length).toBeGreaterThan(0);
    child.kill('SIGTERM');
    const { code, signal } = await closed;
    expect(code === 143 || signal === 'SIGTERM').toBe(true);
    for (let i = 0; i < 60 && running.some(alive); i++) await new Promise((r) => setTimeout(r, 50));
    expect(running.filter(alive)).toEqual([]);
  }, 60000);

  it('every registered group runs on exactly one side', async () => {
    const { GROUPS } = await import('../../blender/checks/clip-groups.mjs');
    const { ENGINE_GROUPS, BROWSER_ONLY } = await import('../../scripts/studio/clip.mjs');
    expect([...ENGINE_GROUPS, ...BROWSER_ONLY].sort()).toEqual(Object.keys(GROUPS).sort());
    expect(ENGINE_GROUPS.filter((g) => BROWSER_ONLY.includes(g))).toEqual([]);
  });
});
