import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeTemp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');

describe('sweep --against', () => {
  // The main run stops early (an unknown indexed moment), while the control is still running.
  it('leaves no worktree and no temp directory when the run fails', () => {
    // The sweep gets a scratch directory (HITL_TMP) of its own, so other runs on the machine cannot
    // change what is counted.
    const tmp = makeTemp('sweep-against-test-');
    const worktrees = () => execFileSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }).split('\n').filter((l) => l.startsWith(`worktree ${tmp}/`)).length;
    try {
      const r = spawnSync(process.execPath, ['blender/checks/sweep.mjs', '--against', 'HEAD', '--mocks', 'none', '--seeds', 'none', '--moments', 'no_such_event_zz', '--out', 'shots/sweep-against-test'], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, HITL_TMP: tmp } });
      expect(r.status).not.toBe(0);
      expect(worktrees()).toBe(0);
      expect(readdirSync(tmp).filter((n) => n.startsWith('hitl-wt-'))).toEqual([]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 300000);
});
