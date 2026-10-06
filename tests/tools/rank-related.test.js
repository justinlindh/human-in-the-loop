import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { distance, rank } from '../../scripts/tools/rank-related.mjs';

describe('rank-related', () => {
  it('measures import distance to the nearest changed file', () => {
    expect(distance('tests/tools/pace-browser.test.js', new Set(['tests/tools/pace-browser.test.js']))).toBe(0);
    expect(distance('tests/tools/pace-browser.test.js', new Set(['scripts/pace-browser.js']))).toBe(1);
    expect(distance('tests/tools/pace-browser.test.js', new Set(['no/such/file.js']))).toBe(Infinity);
  });

  it('puts the nearest first, then the shorter, then the path', () => {
    const durations = { 'tests/b.test.js': 5, 'tests/c.test.js': 1 };
    const order = rank(['tests/far.test.js', 'tests/b.test.js', 'tests/c.test.js', 'tests/tools/pace-browser.test.js'],
      ['scripts/pace-browser.js'], { durations });
    expect(order[0]).toBe('tests/tools/pace-browser.test.js');
    // None reach the change; an unknown duration counts as 1 s.
    expect(order.slice(1)).toEqual(['tests/c.test.js', 'tests/far.test.js', 'tests/b.test.js']);
  });

  it('cuts to the cap and refuses bad arguments', () => {
    const run = (args, input) => spawnSync(process.execPath, ['scripts/tools/rank-related.mjs', ...args], { input, encoding: 'utf8', timeout: 15000 });
    const ok = run(['--cap', '1', '--changed', 'scripts/pace-browser.js'], 'tests/sim/x.test.js\ntests/tools/pace-browser.test.js\n');
    expect(ok.status).toBe(0);
    expect(ok.stdout.trim()).toBe('tests/tools/pace-browser.test.js');
    for (const bad of [['--cap', '0', '--changed', 'x'], ['--changed', 'x'], ['--cap', '2']]) {
      expect(run(bad, '').status).toBe(2);
    }
  });
});
