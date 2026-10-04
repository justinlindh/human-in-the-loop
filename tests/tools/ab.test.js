import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join, resolve } from 'node:path';
import { jsonDiff } from '../../scripts/tools/ab-diff.mjs';

const AB = resolve(__dirname, '../../scripts/tools/ab.sh');
let repo, cache, base;
const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
const ab = (...args) => spawnSync('bash', [AB, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, HITL_AB_DIR: cache }, timeout: 120000 });
const worktrees = () => git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;

beforeAll(() => {
  repo = mkdtempSync(join(toolTmp(), 'abrepo-'));
  cache = mkdtempSync(join(toolTmp(), 'abcache-'));
  git('init', '-q');
  writeFileSync(join(repo, 'out.js'), 'console.log(JSON.stringify({ a: 1, b: { c: 2 }, rows: [{ id: "x", v: 1 }, { id: "y", v: 2 }] }));\n');
  writeFileSync(join(repo, 'txt.js'), 'console.log("line one\\nline two");\n');
  writeFileSync(join(repo, 'fail.js'), 'console.error("nope"); process.exit(4);\n');
  writeFileSync(join(repo, 'slow.js'), 'setTimeout(() => console.log("one"), 5000);\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  base = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'out.js'), 'console.log(JSON.stringify({ a: 1, b: { c: 3 }, rows: [{ id: "y", v: 2.5 }, { id: "x", v: 1 }] }));\n');
  writeFileSync(join(repo, 'txt.js'), 'console.log("line one\\nline 2");\n');
  git('commit', '-q', '-am', 'change');
});
afterAll(() => { rmSync(repo, { recursive: true, force: true }); rmSync(cache, { recursive: true, force: true }); });

describe('jsonDiff', () => {
  it('reports changed paths with deltas, matches rows by id, and honours tolerance and ignore', () => {
    const a = { n: 1, rows: [{ id: 'x', v: 1 }, { id: 'y', v: 2 }], t: 5 }, b = { n: 1.004, rows: [{ id: 'y', v: 3 }, { id: 'x', v: 1 }], t: 9 };
    expect(jsonDiff(a, b, { id: 'id', tol: 0.01, ignore: /^t$/ })).toEqual([{ path: 'rows[id=y].v', base: 2, now: 3, delta: 1 }]);
    expect(jsonDiff(a, b).map((d) => d.path)).toContain('n');
    expect(jsonDiff({ x: 1 }, { x: 1, y: 2 })).toEqual([{ path: 'y', base: undefined, now: 2 }]);
  });
});

describe('ab.sh', () => {
  it('diffs JSON output, caches the base result, and leaves no worktree', () => {
    const before = worktrees();
    let r = ab('--base', base, '--id', 'id', '--', 'node', 'out.js');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('computed in');
    expect(r.stdout).toContain('b.c: 2 -> 3');
    expect(r.stdout).toContain('rows[id=y].v: 2 -> 2.5');
    r = ab('--base', base, '--id', 'id', '--', 'node', 'out.js');
    expect(r.stdout).toMatch(/base cached \(computed/);
    expect(worktrees()).toBe(before);
  });

  it('a different command or --key is a different cache entry, and --refresh recomputes', () => {
    ab('--base', base, '--', 'node', 'out.js');
    expect(ab('--base', base, '--key', 'other', '--', 'node', 'out.js').stdout).toContain('computed in');
    expect(ab('--base', base, '--refresh', '--', 'node', 'out.js').stdout).toContain('computed in');
  });

  it('--tol and --ignore hide differences, --fail-on-diff turns a difference into exit 1', () => {
    expect(ab('--base', base, '--tol', '5', '--ignore', 'rows', '--', 'node', 'out.js').stdout).toContain('identical (JSON)');
    expect(ab('--base', base, '--fail-on-diff', '--', 'node', 'out.js').status).toBe(1);
  });

  it('diffs text output', () => {
    const r = ab('--base', base, '--', 'node', 'txt.js');
    expect(r.stdout).toContain('changed line(s) (text)');
    expect(r.stdout).toContain('-line two');
    expect(r.stdout).toContain('+line 2');
  });

  it('exits 3 and shows the error when the command fails, and does not cache a failure', () => {
    const r = ab('--base', base, '--', 'node', 'fail.js');
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('nope');
    expect(ab('--base', base, '--', 'node', 'fail.js').stdout).not.toMatch(/base cached/);
  });

  it('says so when this tree has no changes against the base', () => {
    const r = ab('--base', 'HEAD', '--', 'node', 'out.js');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nothing to compare');
  });

  it('a run waiting on the base result takes over when the run computing it is killed', async () => {
    const start = () => {
      const c = spawn('bash', [AB, '--base', base, '--', 'node', 'slow.js'], { cwd: repo, env: { ...process.env, HITL_AB_DIR: cache }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = '';
      c.stdout.on('data', (d) => { out += d; });
      c.stderr.on('data', (d) => { err += d; });
      return { c, done: new Promise((res) => c.on('close', (code) => res({ code, out, err }))), err: () => err };
    };
    const lockDir = join(cache, base);
    const locked = () => existsSync(lockDir) && readdirSync(lockDir).some((f) => f.endsWith('.lock'));
    const wait = async (cond, ms = 15000) => { for (let t = 0; t < ms && !cond(); t += 100) await new Promise((r) => setTimeout(r, 100)); };
    const a = start();
    await wait(locked);
    expect(locked()).toBe(true);
    const b = start();
    await wait(() => /waiting for it/.test(b.err()));
    expect(b.err()).toContain('waiting for it');
    a.c.kill('SIGINT');
    expect((await a.done).code).toBe(130);
    // The killed run's lock is gone at once, and the waiting run computes the base itself.
    const r = await b.done;
    expect(r.code).toBe(0);
    expect(r.out).toContain('base computed in');
    expect(locked()).toBe(false);
    expect(worktrees()).toBe(1);
  }, 60000);
});
