import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MOD = resolve(__dirname, '../../scripts/tools/worktree.mjs');
let repo;
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
const worktrees = () => git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('hitl-wt-wtest-'));
const sleeping = (n) => Number(spawnSync('bash', ['-c', `for p in /proc/[0-9]*; do tr '\\0' ' ' < $p/cmdline 2>/dev/null; echo; done | grep -c '^sleep ${n} $'`], { encoding: 'utf8' }).stdout.trim() || 0);

// Runs a script that imports the helper, in its own process.
const script = (body) => `import { createWorktree, withWorktree } from ${JSON.stringify(MOD)};\nconst repo = ${JSON.stringify('REPO')};\n${body}`;
const run = (body, { kill } = {}) => new Promise((res) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script(body).replace('"REPO"', JSON.stringify(repo))], { stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; if (kill && out.includes('ready')) child.kill(kill); });
  child.on('close', (code, sig) => res({ code, sig, out }));
});

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'wtrepo-'));
  git('init', '-q');
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  git('add', 'a.txt');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('worktree.mjs', () => {
  it('creates a tree with the commit, applies a patch and an overlay, and removes it', async () => {
    const r = await run(`
      import { writeFileSync, readFileSync, existsSync } from 'node:fs';
      writeFileSync('/tmp/wtest-overlay.txt', 'over\\n');
      let seen;
      await withWorktree({ repo, rev: 'HEAD', label: 'wtest', patch: 'diff --git a/a.txt b/a.txt\\n--- a/a.txt\\n+++ b/a.txt\\n@@ -1 +1 @@\\n-one\\n+two\\n', overlay: { 'x/o.txt': '/tmp/wtest-overlay.txt' } }, (wt) => {
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
      await withWorktree({ repo, label: 'wtest' }, (wt) => { wt.spawn('sleep', ['46']); });
      console.log('done');
    `);
    expect(r.out).toContain('done');
    expect(sleeping(46)).toBe(0);
    expect(worktrees()).toBe(1);
  });

  it('cleans up on process.exit and an uncaught error, children included', async () => {
    let r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['47']); process.exit(124);`);
    expect(r.code).toBe(124);
    r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['47']); throw new Error('crash');`);
    expect(r.code).not.toBe(0);
    expect(sleeping(47)).toBe(0);
    expect(worktrees()).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('cleans up on SIGTERM, children included', async () => {
    const r = await run(`const wt = await createWorktree({ repo, label: 'wtest' }); wt.spawn('sleep', ['48']); console.log('ready'); setInterval(() => {}, 1000);`, { kill: 'SIGTERM' });
    expect(r.code).toBe(143);
    expect(sleeping(48)).toBe(0);
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
});
