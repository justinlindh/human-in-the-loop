import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { tableEntries, touchedSpecs } from '../../blender/checks/stage-touched.js';

const file = (specs, scenarios) => `const helper = 1;\n\nconst SPECS = {\n${specs}\n};\n\nconst SCENARIOS = {\n${scenarios}\n};\n`;
const a = "  'pet.turn': { moment: 'pet', beat: 'turn', rules: [\n    share('x', 'y', 1),\n  ] },";
const b = "  // A comment above.\n  'letter.read': { moment: 'letter', beat: 'read', rules: [\n    share('z', 'w', 2),\n  ] },";
const c = "  'petcat.turn': { moment: 'pet', scenario: 'petcat', beat: 'turn', rules: [] },";
const sc = "  pet: 'setup pet',\n  petcat: 'setup cat',\n  letter: 'setup letter',";

describe('stage --touched', () => {
  it('splits a table into entries with the comment above each', () => {
    const e = tableEntries(file(`${a}\n${b}`, sc), 'SPECS');
    expect([...e.keys()]).toEqual(['pet.turn', 'letter.read']);
    expect(e.get('letter.read')).toMatch(/^ {2}\/\/ A comment above\.\n {2}'letter\.read'/);
    expect([...tableEntries(file(a, sc), 'SCENARIOS').keys()]).toEqual(['pet', 'petcat', 'letter']);
  });

  it('names a new spec, an edited spec and an edited comment, and leaves the rest', () => {
    const base = file(`${a}\n${b}`, sc);
    const head = file(`${a.replace("'y', 1", "'y', 2")}\n${b.replace('A comment', 'Another comment')}\n${c}`, sc);
    expect([...touchedSpecs(base, head)]).toEqual([['pet.turn', 'changed'], ['letter.read', 'changed'], ['petcat.turn', 'added']]);
    expect(touchedSpecs(base, base).size).toBe(0);
  });

  it('names every spec that runs in a scenario whose setup changed', () => {
    const base = file(`${a}\n${b}\n${c}`, sc);
    const head = file(`${a}\n${b}\n${c}`, sc.replace('setup cat', 'setup cat 2'));
    expect([...touchedSpecs(base, head)]).toEqual([['petcat.turn', 'its scenario "petcat" changed']]);
  });

  it('stage.mjs says so when nothing is touched, and refuses an unknown base and an unknown --only', () => {
    const script = resolve(__dirname, '../../blender/checks/stage.mjs');
    const cwd = mkdtempSync(join(tmpdir(), 'hitl-stage-touched-'));
    try {
      // The no-change case compares identical specs even while the real checkout has edits.
      mkdirSync(join(cwd, 'blender/checks'), { recursive: true });
      writeFileSync(join(cwd, 'blender/checks/stage.mjs'), readFileSync(script));
      const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
      git('init', '-q'); git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'test: seed stage specs');
      const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
      let r = run('--touched=HEAD');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/no spec added or changed against HEAD/);
      r = run('--touched=no-such-ref');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/cannot read blender\/checks\/stage\.mjs at "no-such-ref"/);
      r = run('--only=nonesuch');
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--only "nonesuch" matches no spec/);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 130000);
});
