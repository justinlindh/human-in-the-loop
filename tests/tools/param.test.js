import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join } from 'node:path';
import { parseAst } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { applyParams, currentText, resolveParams, paramSpecs, paramPlugin } from '../../blender/checks/param.js';
import { splitTop, cellValue, flatRows } from '../../blender/checks/param-sweep.js';

const SRC = `import x from 'y';
export const K = 3;
const ARR = [1, 2,
  3];
const OTHER = 'a;b';
function f() { const inner = 5; return inner; }
`;

function tree(files) {
  const root = mkdtempSync(join(toolTmp(), 'param-test-'));
  for (const [f, text] of Object.entries(files)) { mkdirSync(join(root, f, '..'), { recursive: true }); writeFileSync(join(root, f), text); }
  return root;
}

describe('param', () => {
  it('rewrites a whole value, a multi-line one, an exported one, and one element', () => {
    const root = tree({ 'src/a.js': SRC });
    try {
      const ps = resolveParams(['K=9', 'ARR=[7,8,9]', 'src/a.js:ARR[1]=0.5'], root);
      const out = applyParams(SRC, ps);
      expect(out).toContain('export const K = 9;');
      expect(out).toContain('const ARR = [7,8,9];\nARR[1] = 0.5;');
      expect(out).toContain('const inner = 5;');
      expect(out).not.toContain('3];');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('reads what a param\'s target holds in source: a whole value, an element, a key', () => {
    const root = tree({ 'src/a.js': `${SRC}const OBJ = { aside: 0.12, radii: [1, 2] };\n` });
    try {
      const [k, arr, el, key, str, missing] = resolveParams(['K=0', 'ARR=0', 'ARR[2]=0', 'OBJ.aside=0', 'OTHER=0', 'ARR[9]=0'], root);
      expect(currentText(k)).toBe('3');
      expect(currentText(arr)).toBe('[1, 2, 3]');
      expect(currentText(el)).toBe('3');
      expect(currentText(key)).toBe('0.12');
      expect(currentText(str)).toBe("'a;b'");
      expect(currentText(missing)).toBe(null);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('applies the whole value before an element whatever the order given', () => {
    const root = tree({ 'src/a.js': SRC });
    try {
      const out = applyParams(SRC, resolveParams(['ARR[0]=5', 'ARR=[1,2,3]'], root));
      expect(out).toMatch(/const ARR = \[1,2,3\];\nARR\[0\] = 5;/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('refuses a missing name, a name declared twice, a bad spec, and a semicolon in the value', () => {
    const root = tree({ 'src/a.js': SRC, 'src/b.js': 'const K = 1;\n' });
    try {
      expect(() => resolveParams(['NOPE=1'], root)).toThrow(/no top-level "const NOPE =" found/);
      expect(() => resolveParams(['K=1'], root)).toThrow(/declared in 2 files/);
      expect(() => resolveParams(['src/a.js:K=1'], root)).not.toThrow();
      expect(() => resolveParams(['nonsense'], root)).toThrow(/can't read/);
      expect(() => resolveParams(['src/a.js:K=1;2'], root)).toThrow(/semicolon/);
      expect(() => resolveParams(['src/a.js:inner=1'], root)).toThrow(/no top-level/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('collects each --param from a command line and builds a plugin only for files it names', () => {
    expect(paramSpecs(['--scene', '--param', 'A=1', '--view', '2', '--param', 'B=2'])).toEqual(['A=1', 'B=2']);
    const root = tree({ 'src/a.js': SRC });
    try {
      const plugin = paramPlugin(resolveParams(['K=4'], root));
      expect(plugin.transform(SRC, join(root, 'src/a.js?t=1')).code).toContain('const K = 4;');
      expect(plugin.transform(SRC, join(root, 'src/other.js'))).toBeNull();
      expect(paramPlugin([])).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('param on declarations as they are written', () => {
  const src = 'const A = 1;   // note\nconst B = 2; // other\nconst C = [1, // first\n  2]; /* x */\nconst D = 4;\n';
  it('keeps a trailing comment and never touches the lines after', () => {
    expect(applyParams(src, [{ name: 'A', index: null, value: '9' }])).toBe(src.replace('A = 1;', 'A = 9;'));
    expect(applyParams(src, [{ name: 'B', index: null, value: '7' }])).toContain('const B = 7; // other\nconst C');
    expect(applyParams(src, [{ name: 'C', index: 1, value: '5' }])).toContain('2]; /* x */\nC[1] = 5;');
  });
  it('refuses a declaration with no semicolon rather than swallowing what follows', () => {
    expect(() => applyParams('const A = 1\nconst B = 2;\n', [{ name: 'A', index: null, value: '9' }])).toThrow(/where A's declaration ends/);
  });
  it('rewrites every top-level const under src/render to source that still parses, and only that one statement', () => {
    const files = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : /\.m?js$/.test(e.name) ? [join(d, e.name)] : []));
    let n = 0;
    for (const f of files('src/render')) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm)) {
        let out;
        try { out = applyParams(text, [{ name: m[1], index: null, value: '0' }]); } catch (e) { expect(String(e.message), `${f} ${m[1]}`).toMatch(/where .* declaration ends/); continue; }
        expect(() => parseAst(out), `${f} ${m[1]}`).not.toThrow();
        expect(out.split('\n').length, `${f} ${m[1]} line count`).toBeLessThanOrEqual(text.split('\n').length);
        expect((out.match(/^(?:export\s+)?const\s/gm) ?? []).length, `${f} ${m[1]} const count`).toBe((text.match(/^(?:export\s+)?const\s/gm) ?? []).length);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('param-sweep', () => {
  it('splits values at top-level commas only', () => {
    expect(splitTop('1,2, 3')).toEqual(['1', '2', '3']);
    expect(splitTop('[1,2],[3,4]')).toEqual(['[1,2]', '[3,4]']);
    expect(splitTop('f(1,2),x')).toEqual(['f(1,2)', 'x']);
  });

  it('reads a cell from scene rows, cover fractions and gesture frames', () => {
    const rows = [
      { frame: 0, id: 's3', anim: 'facepalm', faceCam: 90, covers: { coverHandEyeNear: { fraction: 0.9 } } },
      { frame: 12, id: 's3', anim: 'facepalm', faceCam: 20, covers: { coverHandEyeNear: { fraction: 0.4 } } },
      { frame: 12, id: 's4', anim: 'idle', faceCam: 10, covers: { coverHandEyeNear: { fraction: 0 } } },
    ];
    const o = { measure: 'coverHandEyeNear', rows: "r.anim === 'facepalm' && r.frame >= 12", pick: 'min' };
    expect(cellValue(rows, o)).toBe(0.4);
    expect(cellValue(rows, { ...o, rows: undefined, pick: 'max' })).toBe(0.9);
    expect(cellValue(rows, { measure: 'faceCam', pick: 'median' })).toBe(20);
    expect(cellValue(rows, { ...o, rows: 'r.frame > 99' })).toBeNull();
    const gesture = { frames: [{ t: 0, phase: 'gesture', contact: { hand0Eye: 0.2 } }, { t: 1, phase: 'gesture', contact: { hand0Eye: 0.1 } }] };
    expect(flatRows(gesture)[1].hand0Eye).toBe(0.1);
    expect(cellValue(gesture, { measure: 'hand0Eye', pick: 'mean' })).toBeCloseTo(0.15);
  });
});
