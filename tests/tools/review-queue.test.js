import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { waiting, line } from '../../scripts/tools/review-queue.mjs';

const QUEUE = resolve(__dirname, '../../scripts/tools/review-queue.mjs');

const pr = (number, over = {}, ci = 'SUCCESS', review = null) => ({
  number, title: `t${number}`, isDraft: false, isCrossRepository: false, labels: [], headRefOid: `${number}`.padEnd(40, 'a'), headRefName: `tools/x${number}`,
  author: { login: 'justinlindh' },
  statusCheckRollup: [{ __typename: 'StatusContext', context: 'local-ci', state: ci }, ...(review ? [{ __typename: 'StatusContext', context: 'review', state: review }] : [])],
  ...over,
});

describe('who is waiting', () => {
  const trusted = ['justinlindh'];
  it('holds a green, unreviewed, trusted PR and drops the rest', () => {
    const list = [
      pr(5), pr(3), pr(4, { isDraft: true }), pr(6, { labels: [{ name: 'awaiting-user' }] }), pr(7, { isCrossRepository: true }),
      pr(8, { author: { login: 'someone' } }), pr(9, {}, 'PENDING'), pr(10, {}, 'FAILURE'), pr(11, {}, 'SUCCESS', 'SUCCESS'), pr(12, {}, 'SUCCESS', 'FAILURE'), pr(13, {}, 'SUCCESS', 'PENDING'),
    ];
    expect(waiting(list, trusted).map((w) => w.number)).toEqual([3, 5, 13]);
  });

  it('prints number, short head, branch and title', () => {
    expect(line(waiting([pr(5)], ['justinlindh'])[0])).toBe('#5 5aaaaaaa tools/x5: t5');
  });
});

describe('review-queue command', () => {
  // A fake gh on PATH that prints whatever is in queue.json, or fails when it holds the word fail.
  const setup = (prs) => {
    const dir = mkdtempSync(join(tmpdir(), 'rq-test-'));
    writeFileSync(join(dir, 'queue.json'), JSON.stringify(prs));
    writeFileSync(join(dir, 'gh'), `#!/bin/sh\nf="${dir}/queue.json"\nif grep -q fail "$f"; then echo "boom" >&2; exit 1; fi\ncat "$f"\n`);
    chmodSync(join(dir, 'gh'), 0o755);
    return { dir, set: (v) => writeFileSync(join(dir, 'queue.json'), typeof v === 'string' ? v : JSON.stringify(v)), env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } };
  };
  const run = (env, ...args) => spawnSync(process.execPath, [QUEUE, ...args], { encoding: 'utf8', env, timeout: 30000 });

  it('lists every waiting PR and exits 0, or exits 3 when the queue is empty', () => {
    const t = setup([pr(4), pr(2)]);
    try {
      const r = run(t.env);
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split('\n')).toEqual(['#2 2aaaaaaa tools/x2: t2', '#4 4aaaaaaa tools/x4: t4']);
      t.set([pr(4, {}, 'SUCCESS', 'SUCCESS')]);
      expect(run(t.env).status).toBe(3);
      expect(JSON.parse(run(t.env, '--json').stdout)).toEqual([]);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  it('--wait blocks until something is waiting and then prints all of it', async () => {
    const t = setup([]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--wait', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      const closed = new Promise((res) => child.on('close', (code) => res(code)));
      await new Promise((r) => setTimeout(r, 600));
      expect(out).toBe('');
      t.set([pr(7), pr(8)]);
      expect(await closed).toBe(0);
      expect(out.trim().split('\n').length).toBe(2);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 20000);

  it('--drain prints each PR once and exits only when none is left', async () => {
    const t = setup([pr(7)]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--drain', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      let code = null;
      child.on('close', (c) => { code = c; });
      await new Promise((r) => setTimeout(r, 700));
      expect(out.trim().split('\n')).toEqual(['#7 7aaaaaaa tools/x7: t7']);
      expect(code).toBeNull();
      t.set([pr(7), pr(9)]);
      await new Promise((r) => setTimeout(r, 700));
      expect(out.trim().split('\n')).toEqual(['#7 7aaaaaaa tools/x7: t7', '#9 9aaaaaaa tools/x9: t9']);
      t.set([]);
      for (let i = 0; i < 50 && code === null; i++) await new Promise((r) => setTimeout(r, 100));
      expect(code).toBe(0);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 20000);

  it('refuses bad options, reports a failing gh, and times out a wait', () => {
    const t = setup([]);
    try {
      expect(run(t.env, '--interval', '0').status).toBe(2);
      expect(run(t.env, '--wait', '--drain').status).toBe(2);
      expect(run(t.env, '--bogus').status).not.toBe(0);
      expect(run(t.env, '--wait', '--interval', '0.1', '--timeout', '0.3').status).toBe(4);
      t.set('fail');
      const r = run(t.env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('gh pr list failed: boom');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  it('exits 143 when interrupted while waiting', async () => {
    const t = setup([]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--wait', '--interval', '5'], { env: t.env, stdio: 'ignore' });
      const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
      await new Promise((r) => setTimeout(r, 400));
      child.kill('SIGTERM');
      const { code, signal } = await closed;
      expect(code === 143 || signal === 'SIGTERM').toBe(true);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 20000);
});
