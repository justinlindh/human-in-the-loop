import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { toolTmp, makeTemp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');
const PATHS = ['blender/checks', 'scripts/tools', 'scripts/events', 'scripts/studio', 'tests/tools'];
// The one file allowed to read the system temp directory: it removes trees an older checkout left there.
const READS_SYSTEM_TMP = new Set(['scripts/tools/worktree.mjs']);

describe('tool scratch space', () => {
  it('lives under HITL_TMP, created on first use, and defaults to the disk cache', () => {
    const base = makeTemp('tool-tmp-test-');
    try {
      const dir = join(base, 'nested', 'tmp');
      expect(toolTmp({ HITL_TMP: dir })).toBe(dir);
      expect(statSync(dir).isDirectory()).toBe(true);
      const made = makeTemp('x-', { HITL_TMP: dir });
      expect(dirname(made)).toBe(dir);
      expect(existsSync(made)).toBe(true);
    } finally { rmSync(base, { recursive: true, force: true }); }
    expect(toolTmp({})).toBe(join(homedir(), '.cache', 'hitl-ci', 'tmp'));
  });

  it('is the only scratch space the tools use: no system temp dir, mktemp without -p, or /tmp path', () => {
    const files = execFileSync('git', ['-C', ROOT, 'ls-files', ...PATHS], { encoding: 'utf8' }).split('\n')
      .filter((f) => /\.(m?js|ts|sh)$/.test(f) && f !== 'tests/tools/tool-tmp.test.js');
    const found = [];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      if (!READS_SYSTEM_TMP.has(f) && /\bimport\s*\{[^}]*\btmpdir\b[^}]*\}\s*from\s*['"](node:)?os['"]/.test(text)) found.push(`${f}: imports tmpdir from node:os`);
      if (/\bmktemp\b(?![^\n]*\s-p\s)/.test(text)) found.push(`${f}: mktemp without -p "$HITL_TMP"`);
      if (/['"`]\/tmp(\/|['"`])/.test(text)) found.push(`${f}: a /tmp path`);
    }
    expect(found).toEqual([]);
  });
});
