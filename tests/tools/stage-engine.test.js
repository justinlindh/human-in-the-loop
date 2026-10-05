import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';
import { join, resolve } from 'node:path';

const STAGE = resolve(__dirname, '../../blender/checks/stage.mjs');
const run = (...args) => spawnAsync(process.execPath, [STAGE, ...args], { timeout: 180000, env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Each case starts its own processes, so the cases overlap.
describe.concurrent('stage.mjs on the studio engine', () => {
  it('plays a scenario in both views and prints a parity row per report row', async () => {
    const tmp = mkdtempSync(join(toolTmp(), 'stage-engine-'));
    try {
      const r = await run('--only=letter', '--rows', '--out', join(tmp, 'report.json'));
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const rows = r.stdout.split('\n').filter((l) => l.startsWith('STAGEROW '));
      const report = JSON.parse(readFileSync(join(tmp, 'report.json'), 'utf8')).rows;
      expect(rows).toHaveLength(report.length);
      expect(new Set(report.map((x) => x.view))).toEqual(new Set(['default', 'turned']));
      expect(rows[0]).toMatch(/^STAGEROW ok letter\.read default read \w+ \{"value":[\d.]+,"seconds":[\d.]+\}$/);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    // Engine processes for both views: a loaded runner can stretch them past the default timeout.
  }, 120000);

  it('refuses an unknown option and a name that matches no spec', async () => {
    const [a, b] = await Promise.all([run('--brwoser'), run('--only=nosuchmoment')]);
    expect(a.status).toBe(2);
    expect(b.status).toBe(2);
  });

  it('stops its engine processes when interrupted', async () => {
    const tmp = mkdtempSync(join(toolTmp(), 'stage-engine-'));
    try {
      const child = spawn(process.execPath, [STAGE, '--only=printer,hammer', '--jobs=2', '--out', join(tmp, 'r.json')], { stdio: 'ignore', env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
      const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
      const kids = () => { try { return readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number); } catch { return []; } };
      let hosts = [];
      for (let i = 0; i < 400 && !hosts.length; i++) { await new Promise((r) => setTimeout(r, 25)); hosts = kids(); }
      expect(hosts.length).toBeGreaterThan(0);
      child.kill('SIGTERM');
      const { code, signal } = await closed;
      expect(code === 143 || signal === 'SIGTERM').toBe(true);
      for (let i = 0; i < 100 && hosts.some(alive); i++) await new Promise((r) => setTimeout(r, 25));
      expect(hosts.filter(alive)).toEqual([]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 60000);
});
