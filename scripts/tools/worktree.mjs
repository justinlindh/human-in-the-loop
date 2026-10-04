// Temporary git worktrees that always clean up, for tools that run something on another commit
// (the sweep's --against, pair.js, ab.sh).
//
//   import { withWorktree, createWorktree } from './worktree.mjs';
//   await withWorktree({ repo, rev, label: 'sweep', overlay: { 'blender/checks/x.js': srcFile } }, async (wt) => {
//     const { done } = wt.spawn(process.execPath, [join(wt.path, 'script.mjs')], { stdio: 'inherit' });
//     await done;
//   });
//
// createWorktree/withWorktree options:
//   repo       the repository (default: the current directory's)      rev  a commit, branch or tag
//   label      part of the temp directory's name
//   modules    the checkout whose node_modules the tree links to (default: repo)
//   patch      a diff (Buffer or string) applied to the tree, such as `git diff HEAD --binary`
//   overlay    { 'path/in/tree': '/file/to/copy/there' }
// The worktree and everything spawned through wt.spawn (each child in its own process group) are
// removed on every way out: dispose(), an exception in withWorktree, process.exit(), an uncaught
// error, SIGINT, SIGTERM and SIGHUP. A run that was SIGKILLed leaves its tree behind; the next
// createWorktree in any process removes trees whose owner process is gone.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, copyFileSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { toolTmp } from './tmp.mjs';

const PREFIX = 'hitl-wt-';
const live = new Set();
let hooked = false;

const git = (repo, args, opts = {}) => execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

function removeTree(repo, tmp) {
  try { git(repo, ['worktree', 'remove', '--force', join(tmp, 'tree')]); } catch { /* removed below */ }
  rmSync(tmp, { recursive: true, force: true });
  try { git(repo, ['worktree', 'prune']); } catch { /* the repo may be gone */ }
}

// Trees whose owning process died without cleaning up (SIGKILL, a crash of the machine), in the
// tools' scratch directory and in the system one, where an older checkout of this module puts them.
function reapStale() {
  for (const root of new Set([toolTmp(), tmpdir()])) {
    let names = [];
    try { names = readdirSync(root); } catch { continue; }
    for (const name of names) {
      if (!name.startsWith(PREFIX)) continue;
      const tmp = join(root, name);
      try {
        const { pid, repo } = JSON.parse(readFileSync(join(tmp, 'owner.json'), 'utf8'));
        if (!isAlive(pid)) removeTree(repo, tmp);
      } catch { /* not ours, or being created */ }
    }
  }
}

function hook() {
  if (hooked) return;
  hooked = true;
  process.on('exit', () => { for (const w of [...live]) w.disposeSync(); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { for (const w of [...live]) w.disposeSync(); process.exit(128 + osConstants.signals[sig]); });
  }
}

export async function createWorktree({ repo = process.cwd(), rev = 'HEAD', label = 'tree', modules = null, patch = null, overlay = {} } = {}) {
  hook();
  reapStale();
  repo = resolve(repo);
  const tmp = mkdtempSync(join(toolTmp(), `${PREFIX}${label}-`));
  writeFileSync(join(tmp, 'owner.json'), JSON.stringify({ pid: process.pid, repo }));
  const path = join(tmp, 'tree');
  const children = new Set();
  const wt = {
    path, tmp, rev,
    // A child in its own process group, ended with the worktree; `done` resolves with its exit code.
    spawn(cmd, args = [], opts = {}) {
      const child = spawn(cmd, args, { cwd: path, ...opts, detached: true });
      children.add(child);
      const done = new Promise((res) => { child.on('close', (code, sig) => { children.delete(child); res(code ?? (sig ? 128 + osConstants.signals[sig] : 1)); }); child.on('error', () => res(127)); });
      return { child, done };
    },
    disposeSync() {
      if (!live.delete(wt)) return;
      for (const c of children) { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* gone */ } }
      if (children.size) pause(300);
      for (const c of children) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
      children.clear();
      removeTree(repo, tmp);
    },
    async dispose() { wt.disposeSync(); },
  };
  live.add(wt);
  try {
    git(repo, ['worktree', 'add', '-q', '--detach', path, rev]);
    const nm = join(modules ? resolve(modules) : repo, 'node_modules');
    if (existsSync(nm) && !existsSync(join(path, 'node_modules'))) symlinkSync(nm, join(path, 'node_modules'));
    if (patch && patch.length) execFileSync('git', ['-C', path, 'apply', '--whitespace=nowarn'], { input: patch, stdio: ['pipe', 'ignore', 'inherit'] });
    for (const [rel, from] of Object.entries(overlay)) {
      mkdirSync(dirname(join(path, rel)), { recursive: true });
      copyFileSync(from, join(path, rel));
    }
  } catch (e) {
    wt.disposeSync();
    throw e;
  }
  return wt;
}

export async function withWorktree(opts, fn) {
  const wt = await createWorktree(opts);
  try { return await fn(wt); } finally { wt.disposeSync(); }
}
