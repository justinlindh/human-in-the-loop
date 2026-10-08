import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');
const tmp = mkdtempSync(join(toolTmp(), 'scene-patch-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// --patch-js is an async body: an import it awaits has finished before the still and --report run.
describe('scene.mjs --patch-js', () => {
  it('waits for a patch that imports a module, and the page has __advance for the setup helpers', () => {
    const out = join(tmp, 'still.png');
    const patch = "const m = await import('/src/render/checks.js'); window.__patched = [typeof m.setupDeal, typeof window.__advance];";
    const r = spawnSync(process.execPath, ['blender/checks/scene.mjs', '--mock', 'floor', '--software', '--size', '320x200', '--out', out, '--patch-js', patch, '--report', 'JSON.stringify(window.__patched)'], { encoding: 'utf8', cwd: ROOT, timeout: 240000 });
    expect(r.status, r.stderr.slice(-400)).toBe(0);
    expect(r.stdout).toContain('scene: report "[\\"function\\",\\"function\\"]"');
    expect(existsSync(out)).toBe(true);
  }, 250000);
});
