import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join, resolve } from 'node:path';
import { queue, line, parseSkip, skipped } from '../../scripts/tools/review-queue.mjs';

const QUEUE = resolve(__dirname, '../../scripts/tools/review-queue.mjs');

// `ci` is the state of the required check `smoke` (`commits` always passes; null: nothing reported yet). A
// failing local-ci rides along on every PR with checks: it is not required, so it must change nothing.
const run_ = (name, ci) => ({ __typename: 'CheckRun', name, status: ci === 'PENDING' ? 'IN_PROGRESS' : 'COMPLETED', conclusion: ci === 'PENDING' ? '' : ci });
const pr = (number, over = {}, ci = 'SUCCESS', review = null) => ({
  number, title: `t${number}`, isDraft: false, isCrossRepository: false, labels: [], headRefOid: `${number}`.padEnd(40, 'a'), headRefName: `tools/x${number}`,
  author: { login: 'justinlindh' },
  statusCheckRollup: [...(ci ? [run_('commits', 'SUCCESS'), run_('smoke', ci), { __typename: 'StatusContext', context: 'local-ci', state: 'FAILURE' }] : []), ...(review ? [{ __typename: 'StatusContext', context: 'review', state: review }] : [])],
  ...over,
});
const REQUIRED = ['commits', 'smoke'];

describe('who is waiting, and in which group', () => {
  const trusted = ['justinlindh'];
  const groups = (list) => queue(list, trusted, undefined, REQUIRED).map((w) => `${w.group}#${w.number}`);

  it('sorts ready, dependabot, outside and ci-not-green PRs into groups and drops the rest', () => {
    const list = [
      pr(5), pr(3), pr(4, { isDraft: true }), pr(6, { labels: [{ name: 'awaiting-user' }] }),
      pr(7, { isCrossRepository: true }), pr(8, { author: { login: 'someone' } }),
      pr(9, {}, 'PENDING'), pr(10, {}, 'FAILURE'), pr(14, {}, null),
      pr(11, {}, 'SUCCESS', 'SUCCESS'), pr(12, {}, 'SUCCESS', 'FAILURE'), pr(13, {}, 'SUCCESS', 'PENDING'),
      pr(15, { author: { login: 'app/dependabot' } }, null), pr(16, { author: { login: 'dependabot[bot]' } }, 'FAILURE'),
      pr(17, { author: { login: 'app/dependabot' }, isCrossRepository: true }, null),
    ];
    expect(groups(list)).toEqual(['READY#3', 'READY#5', 'READY#13', 'DEPENDABOT#15', 'DEPENDABOT#16', 'OUTSIDE#7', 'OUTSIDE#8', 'OUTSIDE#17', 'CI#9', 'CI#10', 'CI#14']);
  });

  it('only a failing CI wakes a waiter; a pending or missing one is listed but waits', () => {
    const w = (n, ci) => queue([pr(n, {}, ci)], trusted, undefined, REQUIRED)[0];
    expect(w(1, 'FAILURE').wake).toBe(true);
    expect(w(2, 'PENDING').wake).toBe(false);
    expect(w(3, null).wake).toBe(false);
    expect(queue([pr(4, { author: { login: 'x' } }, null)], trusted, undefined, REQUIRED)[0].wake).toBe(true);
  });

  it('prints group, number, short head, branch and title, with the reason for a CI line and the repo when given', () => {
    expect(line(queue([pr(5)], ['justinlindh'], undefined, REQUIRED)[0])).toBe('READY #5 5aaaaaaa tools/x5: t5');
    expect(line(queue([pr(9, {}, 'PENDING')], ['justinlindh'], undefined, REQUIRED)[0])).toBe('CI #9 9aaaaaaa tools/x9: t9 (smoke pending)');
    expect(line(queue([pr(5)], ['justinlindh'], 'me/site', REQUIRED)[0])).toBe('READY me/site#5 5aaaaaaa tools/x5: t5');
  });

  it('READY rests on the required checks, not on local-ci, which is no longer posted', () => {
    const noLocalCi = (n, ...runs) => pr(n, { statusCheckRollup: runs.map(([name, c]) => run_(name, c)) }, null);
    const g = (p, req = REQUIRED) => queue([p], ['justinlindh'], undefined, req)[0];
    expect(g(noLocalCi(1, ['commits', 'SUCCESS'], ['smoke', 'SUCCESS'])).group).toBe('READY');
    expect(g(noLocalCi(2, ['commits', 'SUCCESS'], ['smoke', 'SKIPPED'])).group).toBe('READY');
    expect(g(noLocalCi(3, ['commits', 'SUCCESS'], ['smoke', 'PENDING']))).toMatchObject({ group: 'CI', wake: false, waiting: ['smoke pending'] });
    expect(g(noLocalCi(4, ['commits', 'SUCCESS']))).toMatchObject({ group: 'CI', waiting: ['smoke none'] });
    expect(g(noLocalCi(5, ['commits', 'SUCCESS'], ['smoke', 'FAILURE']))).toMatchObject({ group: 'CI', ci: 'failure', wake: true });
    // A check nothing requires does not hold a PR back; a verdict on the head still removes it.
    expect(g(noLocalCi(6, ['commits', 'SUCCESS'], ['smoke', 'SUCCESS'], ['balance', 'FAILURE'])).group).toBe('READY');
    expect(queue([pr(7, {}, 'SUCCESS', 'SUCCESS')], ['justinlindh'], undefined, REQUIRED)).toEqual([]);
    // The rules unreadable: every reported check but review and local-ci must pass; none reported is not ready.
    expect(g(noLocalCi(8, ['commits', 'SUCCESS'], ['smoke', 'SUCCESS']), null).group).toBe('READY');
    expect(g(noLocalCi(9, ['commits', 'SUCCESS'], ['smoke', 'PENDING']), null).group).toBe('CI');
    expect(g(noLocalCi(10), null)).toMatchObject({ group: 'CI', waiting: ['checks none'] });
  });
});

describe('--skip', () => {
  const w = (number, head, repo) => ({ number, head, ...(repo ? { repo } : {}) });
  it('reads [owner/name#]n[@head] lists and matches on number, repo and head', () => {
    expect(parseSkip(['12,#13', 'me/site#14@ABCDEF12'])).toEqual([
      { repo: null, number: 12, head: null }, { repo: null, number: 13, head: null }, { repo: 'me/site', number: 14, head: 'abcdef12' }]);
    expect(parseSkip([])).toEqual([]);
    expect(parseSkip(['12@zz'])).toBe(null);
    const s = parseSkip(['12', '14@abcdef12', 'me/site#15']);
    expect(skipped(w(12, '00000000'), s)).toBe(true);
    expect(skipped(w(12, '00000000', 'me/site'), s)).toBe(true);
    expect(skipped(w(14, 'abcdef12'), s)).toBe(true);
    expect(skipped(w(14, 'bbbbbbbb'), s)).toBe(false);
    expect(skipped(w(15, '00000000', 'me/site'), s)).toBe(true);
    expect(skipped(w(15, '00000000'), s)).toBe(false);
    expect(skipped(w(16, '00000000'), s)).toBe(false);
    expect(skipped(w(14, 'abcdef12'), parseSkip(['14@abcdef1234567890']))).toBe(true);
  });
});

describe('review-queue command', () => {
  // A fake gh on PATH that prints whatever is in queue.json, or fails when it holds the word fail.
  const setup = (prs) => {
    const dir = mkdtempSync(join(toolTmp(), 'rq-test-'));
    writeFileSync(join(dir, 'queue.json'), JSON.stringify(prs));
    writeFileSync(join(dir, 'gh'), `#!/bin/sh\nf="${dir}/queue.json"\nif grep -q fail "$f"; then echo "boom" >&2; exit 1; fi\ncat "$f"\n`);
    chmodSync(join(dir, 'gh'), 0o755);
    // A rename, so a poll never reads a half-written queue.
    const set = (v) => { writeFileSync(join(dir, 'queue.next'), typeof v === 'string' ? v : JSON.stringify(v)); renameSync(join(dir, 'queue.next'), join(dir, 'queue.json')); };
    return { dir, set, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } };
  };
  const run = (env, ...args) => spawnSync(process.execPath, [QUEUE, ...args], { encoding: 'utf8', env, timeout: 30000 });
  // Polls until `ready()` holds or the deadline passes: a loaded machine can take seconds to start node.
  const until = async (ready, ms = 10000) => {
    for (const end = Date.now() + ms; !ready() && Date.now() < end;) await new Promise((r) => setTimeout(r, 50));
  };
  const lines = (out) => out.trim().split('\n');

  it('lists every waiting PR and exits 0, or exits 3 when the queue is empty', () => {
    const t = setup([pr(4), pr(2), pr(6, { author: { login: 'app/dependabot' } }, null)]);
    try {
      const r = run(t.env);
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split('\n')).toEqual(['READY #2 2aaaaaaa tools/x2: t2', 'READY #4 4aaaaaaa tools/x4: t4', 'DEPENDABOT #6 6aaaaaaa tools/x6: t6']);
      t.set([pr(4, {}, 'SUCCESS', 'SUCCESS')]);
      expect(run(t.env).status).toBe(3);
      expect(JSON.parse(run(t.env, '--json').stdout)).toEqual([]);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  it('looks in each --repo and names it on the line', () => {
    const t = setup([pr(4)]);
    try {
      const r = run(t.env, '--repo', 'me/site', '--repo', 'me/game');
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split('\n')).toEqual(['READY me/site#4 4aaaaaaa tools/x4: t4', 'READY me/game#4 4aaaaaaa tools/x4: t4']);
      expect(run(t.env, '--repo', 'nonsense').status).toBe(2);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  it('--wait at an interval of 15 s or more reads the shared snapshot; a one-shot run still asks GitHub', () => {
    const t = setup([pr(4)]);
    try {
      const env = { ...t.env, HITL_PR_SNAPSHOT: join(t.dir, 'snapshot.json') };
      const first = run(env, '--wait', '--interval', '15', '--timeout', '20');
      expect([first.status, first.stdout.trim()]).toEqual([0, 'READY #4 4aaaaaaa tools/x4: t4']);
      t.set([]);
      const second = run(env, '--wait', '--interval', '15', '--timeout', '1');
      expect([second.status, second.stdout.trim()]).toEqual([0, 'READY #4 4aaaaaaa tools/x4: t4']);
      expect(run(env).status).toBe(3);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  // The cases that wait out real polling run side by side; each has a scratch queue of its own.
  it.concurrent('--wait blocks until something wakes it and then prints all of it, pending CI included', async () => {
    const t = setup([pr(3, {}, 'PENDING')]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--wait', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      const closed = new Promise((res) => child.on('close', (code) => res(code)));
      await new Promise((r) => setTimeout(r, 600));
      expect(out).toBe('');
      t.set([pr(3, {}, 'PENDING'), pr(7), pr(8)]);
      expect(await closed).toBe(0);
      expect(out.trim().split('\n').length).toBe(3);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 20000);

  it.concurrent('--wait --skip stands while only skipped PRs wait, and wakes on a skipped PR at a new head', async () => {
    const t = setup([pr(2), pr(4)]);
    try {
      expect(run(t.env, '--skip', '2,4').status).toBe(3);
      const child = spawn(process.execPath, [QUEUE, '--wait', '--interval', '0.2', '--skip', '2', '--skip', '4@4aaaaaaa'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      const closed = new Promise((res) => child.on('close', (code) => res(code)));
      await new Promise((r) => setTimeout(r, 600));
      expect(out).toBe('');
      t.set([pr(2), pr(4, { headRefOid: '4b'.padEnd(40, 'b') })]);
      expect(await closed).toBe(0);
      expect(lines(out)).toEqual(['READY #4 4bbbbbbb tools/x4: t4']);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 20000);

  it.concurrent('--drain prints each PR once and exits only when none is left that needs a look', async () => {
    const t = setup([pr(7)]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--drain', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      let code = null;
      child.on('close', (c) => { code = c; });
      // Each wait sees the line arrive, then a few more polls go by so a repeat would show.
      await until(() => out.trim());
      await new Promise((r) => setTimeout(r, 600));
      expect(lines(out)).toEqual(['READY #7 7aaaaaaa tools/x7: t7']);
      expect(code).toBeNull();
      t.set([pr(7), pr(9)]);
      await until(() => lines(out).length >= 2);
      await new Promise((r) => setTimeout(r, 600));
      expect(lines(out)).toEqual(['READY #7 7aaaaaaa tools/x7: t7', 'READY #9 9aaaaaaa tools/x9: t9']);
      t.set([pr(11, {}, 'PENDING')]);
      await until(() => code !== null);
      expect(code).toBe(0);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 30000);

  it.concurrent('--drain on a queue that holds only pending CI keeps waiting until that PR is ready and then reviewed', async () => {
    const t = setup([pr(3, {}, 'PENDING')]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--drain', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      let code = null;
      child.on('close', (c) => { code = c; });
      await until(() => out.trim());
      await new Promise((r) => setTimeout(r, 600));
      expect(out.trim()).toBe('CI #3 3aaaaaaa tools/x3: t3 (smoke pending)');
      expect(code).toBeNull();
      t.set([pr(3, {}, 'SUCCESS')]);
      await until(() => lines(out).length >= 2);
      expect(lines(out).pop()).toBe('READY #3 3aaaaaaa tools/x3: t3');
      expect(code).toBeNull();
      t.set([pr(3, {}, 'SUCCESS', 'SUCCESS')]);
      await until(() => code !== null);
      expect(code).toBe(0);
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 30000);

  it.concurrent('--drain prints a PR again when it moves from pending CI to ready on the same head', async () => {
    const t = setup([pr(3, {}, 'PENDING'), pr(5)]);
    try {
      const child = spawn(process.execPath, [QUEUE, '--drain', '--interval', '0.2'], { env: t.env });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      await until(() => lines(out).length >= 2);
      expect(lines(out)).toEqual(['READY #5 5aaaaaaa tools/x5: t5', 'CI #3 3aaaaaaa tools/x3: t3 (smoke pending)']);
      t.set([pr(3, {}, 'SUCCESS'), pr(5)]);
      await until(() => lines(out).length >= 3);
      expect(lines(out)).toEqual(['READY #5 5aaaaaaa tools/x5: t5', 'CI #3 3aaaaaaa tools/x3: t3 (smoke pending)', 'READY #3 3aaaaaaa tools/x3: t3']);
      child.kill('SIGTERM');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  }, 30000);

  it('refuses bad options, reports a failing gh, and times out a wait', () => {
    const t = setup([]);
    try {
      expect(run(t.env, '--interval', '0').status).toBe(2);
      expect(run(t.env, '--wait', '--drain').status).toBe(2);
      expect(run(t.env, '--bogus').status).not.toBe(0);
      expect(run(t.env, '--wait', '--interval', '0.1', '--timeout', '0.3').status).toBe(4);
      for (const bad of ['x', '12@', '12@zz', 'me#12', '1,,x']) expect(run(t.env, '--skip', bad).status, bad).toBe(2);
      t.set('fail');
      const r = run(t.env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('gh pr list failed: boom');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
  });

  it.concurrent('exits 143 when interrupted while waiting', async () => {
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
