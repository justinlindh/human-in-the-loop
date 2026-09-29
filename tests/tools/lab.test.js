import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { discover, livePlugin } from '../../scripts/tools/lab.mjs';
import { listConsts } from '../../blender/checks/param.js';

const ROOT = resolve(__dirname, '../..');

describe('listConsts', () => {
  it('lists numeric and numeric-array consts, and leaves the rest', () => {
    const code = ["const A = 0.5;", "const B = [1, -2.5, 3e-1];", "const C = { x: 1 };", "const D = 'hi';", "const E = [1, 'a'];", "export const F = -4; // note", "  const nested = 1;"].join('\n');
    expect(listConsts(code)).toEqual([{ name: 'A', value: 0.5 }, { name: 'B', value: [1, -2.5, 0.3] }, { name: 'F', value: -4 }]);
  });
});

describe('pose lab server', () => {
  it('finds the palm constants a slider can drive', () => {
    const found = discover(ROOT);
    const palm = found.find((c) => c.name === 'PALM_STAND');
    expect(palm.file).toBe('src/render/character.js');
    expect(palm.value).toHaveLength(5);
  });

  it('applies a replaceable override list to the file it names, the way --param does', () => {
    const { set, plugin } = livePlugin(ROOT);
    const file = resolve(ROOT, 'src/render/character.js');
    const code = 'const PALM_STAND = [1, 2, 3];\n';
    expect(plugin.transform(code, file)).toBeNull();
    set(['src/render/character.js:PALM_STAND[1]=9']);
    expect(plugin.transform(code, file).code).toContain('PALM_STAND[1] = 9;');
    expect(plugin.transform(code, resolve(ROOT, 'src/render/other.js'))).toBeNull();
    set([]);
    expect(plugin.transform(code, file)).toBeNull();
  });

  it('refuses a spec that names nothing', () => {
    expect(() => livePlugin(ROOT).set(['src/render/character.js:NO_SUCH_CONST=1'])).toThrow(/no top-level/);
  });
});
