import { describe, it, expect } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { readdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
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

  it('exits 2 with one line when --against names no checkout or ref', () => {
    const r = spawnSync(process.execPath, ['blender/checks/sweep.mjs', '--against', 'no_such_ref_zz', '--mocks', 'garage', '--seeds', 'none', '--no-screen', '--out', 'shots/sweep-against-test'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(2);
    expect(r.stderr.trim()).toBe('sweep: --against no_such_ref_zz is neither a checkout nor a git ref');
  }, 90000);

  // The control is a checkout whose garage mock drops an extra espresso onto the first desk, so
  // only the control finds that overlap: it is gone on this checkout.
  it('keeps the control report in <out>/control and prints the rows only the control found', () => {
    const tmp = makeTemp('sweep-against-test-');
    const ctl = join(tmp, 'ctl');
    const out = join(tmp, 'out');
    try {
      execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', '-q', ctl, 'HEAD']);
      const mock = join(ctl, 'src/dev/mockSim.js');
      const src = readFileSync(mock, 'utf8');
      const anchor = '  for (const [itemId, level] of MOCK_ITEMS[stage]) tryPlace(itemId, level, wallSpots);\n';
      expect(src).toContain(anchor);
      writeFileSync(mock, src.replace(anchor, `${anchor}  if (stage === 0) placed.push({ id: 'fx', level: 1, itemId: 'espresso', x: placed[0].x, y: placed[0].y, rot: 0 });\n`));
      const r = spawnSync(process.execPath, ['blender/checks/sweep.mjs', '--against', ctl, '--mocks', 'garage', '--seeds', 'none', '--no-screen', '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, HITL_TMP: tmp } });
      expect(r.status, r.stderr).toBe(0);
      const control = JSON.parse(readFileSync(join(out, 'control/report.json'), 'utf8'));
      const mine = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
      expect(existsSync(join(out, 'control/report.md'))).toBe(true);
      // Each report names the code it played: the control its own checkout, with the mock edit uncommitted.
      const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      expect(mine.checkout.commit).toBe(head);
      expect(control.checkout).toEqual({ commit: head, dirty: true });
      const only = control.violations.map((v) => v.key).filter((k) => !mine.violations.some((v) => v.key === k));
      expect(only.some((k) => k.includes('espresso'))).toBe(true);
      const printed = r.stdout.split('\n').filter((l) => l.startsWith('sweep: gone vs ctl: ')).map((l) => l.slice('sweep: gone vs ctl: '.length));
      expect(printed.sort()).toEqual([...new Set(only)].sort());
    } finally {
      try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', ctl], { stdio: 'ignore' }); } catch { /* not created */ }
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 300000);
});
