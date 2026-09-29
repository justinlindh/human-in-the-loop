import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const JOB = resolve(__dirname, '../../scripts/tools/job.sh');
let dir;
const job = (...args) => spawnSync('bash', [JOB, ...args], { encoding: 'utf8', env: { ...process.env, HITL_JOBS_DIR: dir }, timeout: 60000 });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'jobs-')); });
afterEach(() => { for (const n of ['a', 'b', 'c', 'd']) job('stop', n); rmSync(dir, { recursive: true, force: true }); });

// Counts processes whose command line is exactly `sleep <n>`.
const sleeping = (n) => {
  const r = spawnSync('bash', ['-c', `for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null; echo; done | grep -c '^sleep ${n} $'`], { encoding: 'utf8' });
  return Number(r.stdout.trim() || 0);
};

describe('job.sh', () => {
  it('runs a command and reports its exit code and log tail', () => {
    expect(job('start', 'a', '--', 'bash', '-c', 'echo hello; exit 3').status).toBe(0);
    const r = job('wait', 'a');
    expect(r.status).toBe(3);
    expect(r.stdout).toContain('hello');
    expect(r.stdout).toContain('job a exit 3');
  });

  it('run starts and waits in one call, passing the exit code through', () => {
    const r = job('run', 'b', '--', 'bash', '-c', 'echo done-b');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('done-b');
    expect(job('run', 'b', '--', 'false').status).toBe(1);
  });

  it('records 124 when the timeout kills the job', () => {
    job('start', 'a', '--timeout', '1', '--', 'sleep', '41');
    expect(job('wait', 'a').status).toBe(124);
  });

  it('wait --timeout returns 124 and leaves the job running', () => {
    job('start', 'a', '--', 'sleep', '42');
    expect(job('wait', 'a', '--timeout', '1').status).toBe(124);
    expect(job('ls').stdout).toMatch(/a\s+running/);
    expect(job('stop', 'a').stdout).toContain('stopped');
    expect(job('ls').stdout).toMatch(/a\s+exit/);
  });

  it('refuses a name that is still running and lists jobs', () => {
    job('start', 'c', '--', 'sleep', '43');
    const again = job('start', 'c', '--', 'true');
    expect(again.status).toBe(2);
    expect(again.stderr).toContain('already running');
    expect(job('ls').stdout).toContain('sleep');
  });

  it('stop ends the whole process group', () => {
    job('start', 'd', '--', 'bash', '-c', 'sleep 44 & sleep 44');
    for (let i = 0; i < 50 && !sleeping(44); i++) spawnSync('bash', ['-c', 'sleep 0.1']);
    expect(sleeping(44)).toBeGreaterThan(0);
    expect(job('stop', 'd').stdout).toContain('stopped');
    expect(sleeping(44)).toBe(0);
  });

  it('tail prints the log and an unknown job is an error', () => {
    job('run', 'a', '--', 'bash', '-c', 'echo one; echo two');
    expect(job('tail', 'a', '-n', '1').stdout.trim()).toBe('two');
    expect(job('wait', 'nope').status).toBe(2);
  });
});
