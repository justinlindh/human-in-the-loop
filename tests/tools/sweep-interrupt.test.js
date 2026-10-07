import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const TEST = 'scripts/tools/interrupt-test.mjs';
const run = (args, timeout) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, timeout });

// The engine samples in long synchronous stretches; a SIGTERM during them must still end the run promptly with
// 143, taking the screen step and a control checkout (and its temp tree) down with it.
describe('an interrupted sweep', () => {
  for (const [name, extra] of [['plain run', []], ['--against run', ['--against', 'HEAD']]]) {
    it(`ends on SIGTERM with 143 and leaves nothing behind (${name})`, () => {
      const r = run([TEST, '--after', '6', '--grace', '10', '--', process.execPath, 'blender/checks/sweep.mjs', ...extra], 120000);
      expect(r.stdout, r.stderr).toContain('exit: 143');
      expect(r.stdout).toContain('survivors: none');
      expect(r.stdout).toContain('leftover temp dirs: none');
      expect(r.status).toBe(0);
    }, 130000);
  }
});
