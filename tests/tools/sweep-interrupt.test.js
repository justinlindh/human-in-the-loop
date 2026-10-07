import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const TEST = 'scripts/tools/interrupt-test.mjs';
const run = (args, timeout) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, timeout });

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
