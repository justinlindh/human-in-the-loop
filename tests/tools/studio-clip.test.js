import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLIP = resolve(__dirname, '../../scripts/studio/clip.mjs');
const run = (...args) => spawnSync(process.execPath, [CLIP, ...args], { encoding: 'utf8', timeout: 240000 });

describe('studio clip', () => {
  it('runs a group on the engine and prints the check names the browser run prints', () => {
    const r = run('--group', 'seats');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('CLIP ok   desks:all-seated');
    expect(r.stdout).toMatch(/CLIP ok {3}desk:f1:typing \{"handGapMin"/);
    expect(r.stdout).toMatch(/CLIP ok {3}head:s1:/);
  }, 260000);

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
  });
});
