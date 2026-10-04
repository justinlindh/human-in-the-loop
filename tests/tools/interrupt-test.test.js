import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOOL = resolve(__dirname, '../../scripts/tools/interrupt-test.mjs');
const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', timeout: 60000 });
const node = (code) => ['node', '-e', code];
const HANDLED = "process.on('SIGTERM', () => process.exit(143)); setInterval(() => {}, 1000)";

describe('interrupt-test', () => {
  it('reports a command that exits 143 on SIGTERM with nothing left behind', () => {
    const r = run('--after', '1', '--', ...node(HANDLED));
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('exit: 143');
    expect(r.stdout).toContain('survivors: none');
    expect(r.stdout).toContain('leftover temp dirs: none');
  });

  it('counts a command that dies of the signal itself as a clean interrupt', () => {
    const r = run('--after', '1', '--', 'sleep', '100');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('exit: signal SIGTERM');
  });

  it('names a process that outlived the interrupt and a temp dir the command left, and kills the survivor', async () => {
    const code = `const { spawn } = require('child_process'); require('fs').mkdirSync(process.env.TMPDIR + '/work-left');
      spawn('setsid', ['sleep', '300'], { stdio: 'ignore' }).unref(); ${HANDLED}`;
    const r = run('--after', '1', '--', ...node(code));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/survivors:\n  pid \d+ sleep 300/);
    expect(r.stdout).toContain('leftover temp dirs:\n  work-left');
    const pid = Number(/pid (\d+) sleep 300/.exec(r.stdout)[1]);
    // Killed means gone or a zombie awaiting its reaper (kill -0 still succeeds on a zombie).
    const running = () => { try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return false; } };
    for (let i = 0; i < 50 && running(); i++) await new Promise((r) => setTimeout(r, 100));
    expect(running()).toBe(false);
  });

  it('kills a command that ignores the signal and fails the run', () => {
    const r = run('--after', '1', '--grace', '1', '--', ...node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('still running 1 s after SIGTERM; killed with SIGKILL');
  });

  it('refuses bad options and a command that ended before the interrupt', () => {
    expect(run('--after', '1').status).toBe(2);
    expect(run('--signal', 'KILL', '--', 'true').status).toBe(2);
    expect(run('--after', '-1', '--', 'true').status).toBe(2);
    expect(run('--', 'no-such-command-x').status).toBe(2);
    const early = run('--after', '2', '--', 'true');
    expect(early.status).toBe(2);
    expect(early.stdout).toContain('ended by itself before 2 s');
  });
});
