import { describe, expect, it } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');
const TEST = 'scripts/tools/interrupt-test.mjs';
// A cached clean pass would make the plain sweep skip itself and exit 0 before the interrupt.
const run = (args, timeout) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, timeout, env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });

// The engine builds scenes and samples in long synchronous stretches where a JavaScript signal handler cannot run,
// so it takes SIGTERM at its default action and a reaper process ends the screen step and a control checkout and
// removes the control's temp tree. Interrupted at any point, the run ends at once and leaves nothing behind.
describe('an interrupted sweep', () => {
  // Early (still starting up) and later (sampling), plain and with a control checkout.
  for (const [name, extra, after] of [['plain run', [], 2], ['--against run, starting up', ['--against', 'HEAD'], 0.3], ['--against run, sampling', ['--against', 'HEAD'], 2]]) {
    it(`ends on SIGTERM and leaves nothing behind (${name})`, () => {
      const r = run([TEST, '--after', String(after), '--grace', '10', '--', process.execPath, 'blender/checks/sweep.mjs', ...extra], 120000);
      expect(r.stdout, r.stderr).toMatch(/exit: (143|signal SIGTERM)\n/);
      expect(r.stdout).toContain('survivors: none');
      expect(r.stdout).toContain('leftover temp dirs: none');
      expect(r.status).toBe(0);
    }, 130000);
  }
});

// A control checkout older than what the sweep's borrowed files import is refused before anything starts. A scratch
// repository with one commit stands in for it (a shallow clone may not hold an old real ref).
describe('--against a checkout that is too old', () => {
  it('exits 2 naming what it lacks and the commit to use', () => {
    const dir = mkdtempSync(join(toolTmp(), 'sweep-old-'));
    try {
      const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
      git('init', '-q'); writeFileSync(join(dir, 'a.txt'), 'x');
      git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'old', '--date=2020-01-01T00:00:00Z');
      const r = run(['blender/checks/sweep.mjs', '--against', dir, '--mocks', 'garage', '--seeds', 'none', '--no-screen'], 60000);
      expect(r.status, r.stderr).toBe(2);
      expect(r.stderr).toMatch(/too old.*no scripts\/lib\/timing\.js.*contains 0dd14127/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
