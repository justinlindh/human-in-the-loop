// Cleans up after a process that can be ended by a signal at any moment, including in the middle of a long
// synchronous stretch where its own handlers cannot run. The owner starts this as a child, writes one JSON
// line per thing to clean up, and leaves signals at their default action:
//
//   { "group": <pgid> }               a process group to end (SIGTERM, SIGKILL after a short grace)
//   { "tree": { "repo": p, "tmp": p } }   a worktree's temp directory (worktree.mjs's layout) to remove
//
// When the owner's end of the pipe closes (it exited or was killed, however) everything listed is cleaned
// up and this process exits. Usage: reaper.mjs (no arguments; reads stdin).
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { removeTree } from './worktree.mjs';

const groups = new Set(), trees = [];
createInterface({ input: process.stdin }).on('line', (line) => {
  try {
    const m = JSON.parse(line);
    if (m.group) groups.add(m.group);
    if (m.tree) trees.push(m.tree);
  } catch { /* not ours */ }
});
// A signal meant for the owner's group must not end the reaper before it has cleaned up.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => {});

const alive = (g) => { try { process.kill(-g, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.stdin.on('close', async () => {
  // What the listed groups started in groups of their own (a control sweep's screen step) is found by its
  // command line naming a listed tree.
  const strays = () => {
    if (!trees.length) return [];
    try {
      return execFileSync('ps', ['-eo', 'pgid=,args='], { encoding: 'utf8' }).split('\n')
        .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter((m) => m && trees.some((t) => m[2].includes(t.tmp))).map((m) => +m[1]);
    } catch { return []; }
  };
  for (let i = 0; i < 3; i++) { for (const g of strays()) if (g > 1) groups.add(g); await sleep(20); }
  const live = [...groups].filter(alive);
  for (const g of live) { try { process.kill(-g, 'SIGTERM'); } catch { /* gone */ } }
  for (let i = 0; i < 6 && live.some(alive); i++) await sleep(50);
  for (const g of live) { try { process.kill(-g, 'SIGKILL'); } catch { /* gone */ } }
  for (const t of trees) removeTree(t.repo, t.tmp);
  process.exit(0);
});
