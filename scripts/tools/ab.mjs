// A/B a command: run it on the base (merge base with origin/main, in a temporary worktree) and on
// this checkout, cache the base result per commit, and print one diff. See ab.sh and docs/toolkit/ab.md.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createWorktree } from './worktree.mjs';
import { diffOutputs } from './ab-diff.mjs';

const args = process.argv.slice(2);
const dd = args.indexOf('--');
const opts = dd >= 0 ? args.slice(0, dd) : args;
const cmd = dd >= 0 ? args.slice(dd + 1) : [];
const opt = (k, d = null) => { const i = opts.indexOf(`--${k}`); return i >= 0 ? opts[i + 1] : d; };
const flag = (k) => opts.includes(`--${k}`);
const die = (m, code = 2) => { console.error(`ab: ${m}`); process.exit(code); };
if (!cmd.length || flag('help')) die('usage: scripts/tools/ab.sh [--base <ref>] [--key <text>] [--refresh] [--no-cache] [--timeout s] [--tol x] [--id field] [--ignore <regex>] [--max n] [--fail-on-diff] [--json <file>] -- <cmd...>');

const here = process.cwd();
const top = execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const sub = relative(top, here);
const git = (...a) => execFileSync('git', ['-C', top, ...a], { encoding: 'utf8' }).trim();
const baseRef = opt('base') ?? (() => { for (const r of ['origin/main', 'main']) { try { return git('merge-base', 'HEAD', r); } catch { /* next */ } } die('no origin/main or main to take a merge base with'); })();
const baseSha = git('rev-parse', baseRef);
const timeout = Number(opt('timeout', 3600));
const cacheRoot = process.env.HITL_AB_DIR ?? join(homedir(), '.cache', 'hitl-ab');
const keyText = JSON.stringify({ cmd, key: opt('key', ''), sub });
const key = createHash('sha256').update(keyText).digest('hex').slice(0, 20);
const entry = join(cacheRoot, baseSha, `${key}.json`);
const lock = `${entry}.lock`;

const live = new Set();
let ownsLock = false;
// A signal handler exits without running finally blocks, so the lock and the children go here.
process.on('exit', () => {
  for (const c of live) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
  if (ownsLock) rmSync(lock, { recursive: true, force: true });
});
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));

// Runs the command with nice, in its own process group, killed after `timeout` seconds.
function run(cwd, spawnFn = spawn) {
  return new Promise((res) => {
    const t0 = Date.now();
    const child = spawnFn('nice', ['-n', '10', ...cmd], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const child_ = child.child ?? child;
    live.add(child_);
    let out = '', err = '';
    const CAP = 64 << 20;
    child_.stdout.on('data', (d) => { if (out.length < CAP) out += d; });
    child_.stderr.on('data', (d) => { if (err.length < CAP) err += d; });
    const timer = setTimeout(() => { err += `\nab: timed out after ${timeout} s\n`; try { process.kill(-child_.pid, 'SIGKILL'); } catch { /* gone */ } }, timeout * 1000);
    child_.on('close', (code, sig) => { clearTimeout(timer); live.delete(child_); res({ code: code ?? (sig ? 137 : 1), stdout: out, stderr: err, ms: Date.now() - t0 }); });
    child_.on('error', (e) => { clearTimeout(timer); res({ code: 127, stdout: out, stderr: `${err}${e.message}\n`, ms: Date.now() - t0 }); });
  });
}

const readEntry = () => { try { return JSON.parse(readFileSync(entry, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The base result: from the cache, from another run already computing it (waited for), or computed here.
async function baseResult() {
  if (!flag('refresh') && !flag('no-cache')) { const hit = readEntry(); if (hit) return { ...hit, cached: true }; }
  if (!flag('no-cache')) {
    mkdirSync(join(cacheRoot, baseSha), { recursive: true });
    for (;;) {
      try { mkdirSync(lock); ownsLock = true; writeFileSync(join(lock, 'pid'), String(process.pid)); break; } catch { /* held */ }
      const ownerOf = () => { try { return Number(readFileSync(join(lock, 'pid'), 'utf8')); } catch { return 0; } };
      if (ownerOf() && !alive(ownerOf())) { rmSync(lock, { recursive: true, force: true }); continue; }
      console.error('ab: another run is computing the base result; waiting for it');
      // The owner can die without finishing (killed, crashed): watch for that too, then take over.
      while (existsSync(lock)) {
        if (ownerOf() && !alive(ownerOf())) { rmSync(lock, { recursive: true, force: true }); break; }
        await sleep(500);
      }
      const hit = readEntry();
      if (hit) return { ...hit, cached: true };
    }
  }
  try {
    const wt = await createWorktree({ repo: top, rev: baseSha, label: 'ab' });
    const cwd = join(wt.path, sub);
    const r = await run(cwd, (c, a, o) => wt.spawn(c, a, o));
    wt.disposeSync();
    const result = { cmd, sha: baseSha, code: r.code, stdout: r.stdout, stderr: r.stderr, ms: r.ms, at: new Date().toISOString() };
    if (!flag('no-cache') && r.code === 0) writeFileSync(entry, JSON.stringify(result));
    return { ...result, cached: false };
  } finally {
    if (ownsLock) { rmSync(lock, { recursive: true, force: true }); ownsLock = false; }
  }
}

const label = (() => { try { return git('rev-parse', '--abbrev-ref', 'HEAD'); } catch { return 'HEAD'; } })();
const changed = git('diff', '--stat', baseSha).length > 0 || git('status', '--porcelain', '--untracked-files=no').length > 0;
if (!changed && !flag('force')) {
  console.log(`ab: ${label} has no changes against base ${baseSha.slice(0, 8)}; nothing to compare (--force runs anyway)`);
  process.exit(0);
}

console.log(`ab: base ${baseSha.slice(0, 8)} vs ${label} (working tree): ${cmd.join(' ')}`);
const [base, mine] = await Promise.all([baseResult(), run(here)]);
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
console.log(`ab: base ${base.cached ? `cached (computed ${base.at}, took ${secs(base.ms)})` : `computed in ${secs(base.ms)}`}; this tree ${secs(mine.ms)}`);
for (const [name, r] of [['base', base], ['this tree', mine]]) {
  if (r.code !== 0) { console.error(`ab: the command exited ${r.code} on ${name}${base.cached && name === 'base' ? ' (cached)' : ''}:\n${r.stderr.split('\n').slice(-15).join('\n')}`); }
}
if (base.code !== 0 || mine.code !== 0) process.exit(3);

const d = diffOutputs(base.stdout, mine.stdout, { tol: Number(opt('tol', 0)), id: opt('id'), ignore: opt('ignore') ? new RegExp(opt('ignore')) : null, max: Number(opt('max', 60)) });
console.log(d.text);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ base: baseSha, kind: d.kind, differences: d.list }, null, 1));
process.exit(d.count && flag('fail-on-diff') ? 1 : 0);
