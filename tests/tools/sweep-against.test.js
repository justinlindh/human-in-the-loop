import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const worktrees = () => execFileSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).split('\n').filter((l) => l.startsWith('worktree ')).length;
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('hitl-wt-sweep-against-'));

describe('sweep --against', () => {
  // The main run stops early (an unknown indexed moment), while the control is still running.
  it('leaves no worktree and no temp directory when the run fails', () => {
    const before = worktrees();
    const r = spawnSync(process.execPath, ['blender/checks/sweep.mjs', '--against', 'HEAD', '--mocks', 'none', '--seeds', 'none', '--moments', 'no_such_event_zz', '--out', 'shots/sweep-against-test'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    expect(r.status).not.toBe(0);
    expect(worktrees()).toBe(before);
    expect(leftovers()).toEqual([]);
  }, 300000);
});
