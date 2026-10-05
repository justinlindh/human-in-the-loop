import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOOL = resolve(__dirname, '../../scripts/tools/interrupt-test.mjs');
// Async so the cases below wait out their interrupt delays side by side.
const run = (...args) => new Promise((done) => {
  const p = spawn(process.execPath, [TOOL, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => { stdout += d; });
  p.stderr.on('data', (d) => { stderr += d; });
  const t = setTimeout(() => p.kill('SIGKILL'), 60000);
  p.on('close', (status) => { clearTimeout(t); done({ status, stdout, stderr }); });
});
const AFTER = '0.7';
const node = (code) => ['node', '-e', code];
const HANDLED = "process.on('SIGTERM', () => process.exit(143)); setInterval(() => {}, 1000)";

describe.concurrent('interrupt-test', () => {
  it('reports a command that exits 143 on SIGTERM with nothing left behind', async () => {
    const r = await run('--after', AFTER, '--', ...node(HANDLED));
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('exit: 143');
    expect(r.stdout).toContain('survivors: none');
    expect(r.stdout).toContain('leftover temp dirs: none');
  });

  it('counts a command that dies of the signal itself as a clean interrupt', async () => {
    const r = await run('--after', AFTER, '--', 'sleep', '100');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('exit: signal SIGTERM');
  });

  it('names a process that outlived the interrupt and a temp dir the command left, and kills the survivor', async () => {
    const code = `const { spawn } = require('child_process'); require('fs').mkdirSync(process.env.TMPDIR + '/work-left');
      spawn('setsid', ['sleep', '300'], { stdio: 'ignore' }).unref(); ${HANDLED}`;
    const r = await run('--after', AFTER, '--', ...node(code));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/survivors:\n  pid \d+ sleep 300/);
    expect(r.stdout).toContain('leftover temp dirs:\n  work-left');
    const pid = Number(/pid (\d+) sleep 300/.exec(r.stdout)[1]);
    // Killed means gone or a zombie awaiting its reaper (kill -0 still succeeds on a zombie).
    const running = () => { try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return false; } };
    for (let i = 0; i < 50 && running(); i++) await new Promise((r) => setTimeout(r, 100));
    expect(running()).toBe(false);
  });

  it('kills a command that ignores the signal and fails the run', async () => {
    const r = await run('--after', AFTER, '--grace', '0.5', '--', ...node("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('still running 0.5 s after SIGTERM; killed with SIGKILL');
  });

  it('refuses bad options and a command that ended before the interrupt', async () => {
    const [noCmd, kill, neg, missing, early] = await Promise.all([
      run('--after', '1'), run('--signal', 'KILL', '--', 'true'), run('--after', '-1', '--', 'true'),
      run('--', 'no-such-command-x'), run('--after', '2', '--', 'true'),
    ]);
    for (const r of [noCmd, kill, neg, missing, early]) expect(r.status).toBe(2);
    expect(early.stdout).toContain('ended by itself before 2 s');
  });
});
