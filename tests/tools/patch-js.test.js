import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { runJs } from '../../blender/checks/patch-js.js';

const ROOT = resolve(__dirname, '../..');
const tmp = mkdtempSync(join(toolTmp(), 'patch-js-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const run = (args) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT, timeout: 120000 });

// A patch that awaits an import of a setup-helper module, then checks it loaded.
const IMPORTING = "const m = await import('/src/render/checks.js'); await new Promise((r) => setTimeout(r, 100)); if (typeof m.setupDeal !== 'function') throw new Error('no setupDeal');";

describe('runJs', () => {
  it('runs a body that awaits, sees the named variables, and returns what the body returns', async () => {
    expect(await runJs('await 0; return a + b;', { a: 1, b: 2 })).toBe(3);
  });
  it('rejects with the body\'s error, and a syntax error surfaces', async () => {
    await expect(runJs('await 0; throw new Error("boom");', {})).rejects.toThrow('boom');
    expect(() => runJs('const = ;', {})).toThrow(SyntaxError);
  });
});

// The same --patch-js body works in every check that takes one (the studio engine runs).
describe('--patch-js with an awaited import', () => {
  it('dump.mjs runs it', () => {
    const r = run(['blender/checks/dump.mjs', '--mock', 'floor', '--out', join(tmp, 'dump'), '--frames', '0', '--patch-js', IMPORTING]);
    expect(r.status, r.stderr.slice(-400) + r.stdout.slice(-400)).toBe(0);
  });
  it('dump.mjs fails when the awaited patch throws (it is awaited)', () => {
    const r = run(['blender/checks/dump.mjs', '--mock', 'floor', '--out', join(tmp, 'dump2'), '--frames', '0', '--patch-js', "await 0; throw new Error('patch-boom')"]);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('patch-boom');
  });
  it('onscreen.mjs runs it', () => {
    const r = run(['blender/checks/onscreen.mjs', '--mock', 'floor', '--frames', '0', '--patch-js', IMPORTING, '--json', join(tmp, 'os.json')]);
    expect(r.status, r.stderr.slice(-400) + r.stdout.slice(-400)).toBe(0);
  });
});
