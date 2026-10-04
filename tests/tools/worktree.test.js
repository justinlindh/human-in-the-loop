import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

const MOD = resolve(__dirname, '../../scripts/tools/worktree.mjs');
let repo;
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const worktrees = () => git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
// The spawned scripts get a scratch directory (HITL_TMP) of their own and sleep durations of their
// own, so other test runs on the machine cannot add to what is counted. Their TMPDIR is a second
// empty directory standing in for the system's, which must stay empty.
let tmp, sys;
const leftovers = (dir = tmp) => readdirSync(dir).filter((n) => n.startsWith('hitl-wt-'));
const sleepFor = (k) => 100000 + (process.pid % 50000) * 10 + k;
const sleeping = (n) => Number(spawnSync('bash', ['-c', `for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null; echo; done | grep -c '^sleep ${n} $'`], { encoding: 'utf8' }).stdout.trim() || 0);

// Runs a script that imports the helper, in its own process.
const script = (body) => `import { createWorktree, withWorktree } from ${JSON.stringify(MOD)};\nconst repo = ${JSON.stringify('REPO')};\n${body}`;
const run = (body, { kill, scratch = tmp } = {}) => new Promise((res) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script(body).replace('"REPO"', JSON.stringify(repo))], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, HITL_TMP: scratch, TMPDIR: sys } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; if (kill && out.includes('ready')) child.kill(kill); });
  child.on('close', (code, sig) => res({ code, sig, out }));
});

beforeAll(() => {
  tmp = makeTemp('wtest-tmp-');
  sys = makeTemp('wtest-sys-');
  repo = makeTemp('wtrepo-');
  git('init', '-q');
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  git('add', 'a.txt');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
});
afterAll(() => { for (const d of [repo, tmp, sys]) rmSync(d, { recursive: true, force: true }); });

describe('worktree.mjs', () => {
  it('creates a tree with the commit, applies a patch and an overlay, and removes it', async () => {
    const r = await run(`
      import { writeFileSync, readFileSync, existsSync } from 'node:fs';
      writeFileSync(process.env.HITL_TMP + '/overlay.txt', 'over\\n');
      let seen;
      await withWorktree({ repo, rev: 'HEAD', label: 'wtest', patch: 'diff --git a/a.txt b/a.txt\\n--- a/a.txt\\n+++ b/a.txt\\n@@ -1 +1 @@\\n-one\\n+two\\n', overlay: { 'x/o.txt': process.env.HITL_TMP + '/overlay.txt' } }, (wt) => {
        seen = [readFileSync(wt.path + '/a.txt', 'utf8'), readFileSync(wt.path + '/x/o.txt', 'utf8'), wt.path];
      });
      console.log(JSON.stringify([seen[0], seen[1], existsSync(seen[2])]));
    `);
    expect(JSON.parse(r.out.trim())).toEqual(['two\n', 'over\n', false]);
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('cleans up when the function throws', async () => {
    const r = await run(`try { await withWorktree({ repo, label: 'wtest' }, () => { throw new Error('boom'); }); } catch (e) { console.log('caught ' + e.message); }`);
    expect(r.out).toContain('caught boom');
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('ends its children when disposed', async () => {
    const r = await run(`
      await withWorktree({ repo, label: 'wtest' }, (wt) => { wt.spawn('sleep', ['${sleepFor(1)}']); });
      console.log('done');
    `);
    expect(r.out).toContain('done');
    expect(sleeping(sleepFor(1))).toBe(0);
    expect(worktrees()).toBe(1);
  });

  it('cleans up on process.exit and an uncaught error, children included', async () => {
    let r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['${sleepFor(2)}']); process.exit(124);`);
    expect(r.code).toBe(124);
    r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['${sleepFor(2)}']); throw new Error('crash');`);
    expect(r.code).not.toBe(0);
    expect(sleeping(sleepFor(2))).toBe(0);
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('cleans up on SIGTERM, children included', async () => {
    const r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['${sleepFor(3)}']); console.log('ready'); setInterval(() => {}, 1000);`, { kill: 'SIGTERM' });
    expect(r.code).toBe(143);
    expect(sleeping(sleepFor(3))).toBe(0);
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('removes a tree whose owner was killed outright, on the next create', async () => {
    await run(`await createWorktree({ repo, label: 'wtest' }); console.log('ready'); setInterval(() => {}, 1000);`, { kill: 'SIGKILL' });
    expect(worktrees()).toBe(2);
    const r = await run(`await withWorktree({ repo, label: 'wtest' }, () => {}); console.log('ok');`);
    expect(r.out).toContain('ok');
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('writes nothing to the system temp directory', () => {
    expect(readdirSync(sys)).toEqual([]);
  });

  it('removes a dead tree left in the system temp directory by an older checkout', async () => {
    await run(`await createWorktree({ repo, label: 'wtest' }); console.log('ready'); setInterval(() => {}, 1000);`, { kill: 'SIGKILL', scratch: sys });
    expect(leftovers(sys).length).toBe(1);
    const r = await run(`await withWorktree({ repo, label: 'wtest' }, () => {}); console.log('ok');`);
    expect(r.out).toContain('ok');
    expect(leftovers(sys)).toEqual([]);
    expect(worktrees()).toBe(1);
  });
});
