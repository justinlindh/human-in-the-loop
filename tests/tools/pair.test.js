import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { compare, markdown, parseFields } from '../../scripts/events/pair-report.js';

const rec = (over = {}) => ({ reason: 'exit', exited: true, won: false, weeks: 500, score: 100, incidents: 2, caught: 1, breaches: 1, hash: 'exit|500|100|7', ...over });

describe('pair-report', () => {
  it('counts identical runs, and seeds lost and gained on exit', () => {
    const a = { 'x:1': rec(), 'x:2': rec(), 'x:3': rec({ exited: false, hash: 'a' }), 'x:4': rec() };
    const b = { 'x:1': rec(), 'x:2': rec({ exited: false, hash: 'b' }), 'x:3': rec({ exited: true, hash: 'c' }), 'x:4': rec() };
    const { rows } = compare(a, b);
    expect(rows[0]).toMatchObject({ bot: 'x', runs: 4, same: 2, exitA: 75, exitB: 75 });
    expect(rows[0].lost).toEqual(['x:2']);
    expect(rows[0].gained).toEqual(['x:3']);
  });

  it('takes medians and totals per bot, keeping bots apart', () => {
    const a = { 'x:1': rec({ score: 10 }), 'x:2': rec({ score: 30 }), 'x:3': rec({ score: 20 }), 'y:1': rec({ score: 5 }) };
    const b = { 'x:1': rec({ score: 11, incidents: 4 }), 'x:2': rec({ score: 31 }), 'x:3': rec({ score: 21 }), 'y:1': rec({ score: 6 }) };
    const { rows } = compare(a, b);
    const x = rows.find((r) => r.bot === 'x'), y = rows.find((r) => r.bot === 'y');
    expect([x.scoreA, x.scoreB, x.incidents]).toEqual([20, 21, [6, 8]]);
    expect([y.runs, y.scoreA]).toEqual([1, 5]);
  });

  it('turns --fields values into columns: sums, true counts and value counts', () => {
    const a = { 'x:1': rec({ fields: { n: 2, big: true, era: 'plateau' } }), 'x:2': rec({ fields: { n: 3, big: false, era: 'plateau' } }) };
    const b = { 'x:1': rec({ fields: { n: 4, big: true, era: 'agents' } }), 'x:2': rec({ fields: { n: 5, big: true, era: 'plateau' } }) };
    const { rows, fieldNames } = compare(a, b);
    expect(fieldNames).toEqual(['n', 'big', 'era']);
    expect(rows[0].fields).toEqual({ n: ['5', '9'], big: ['1', '2'], era: ['plateau 2', 'agents 1, plateau 1'] });
    const md = markdown({ rows, fieldNames });
    expect(md.split('\n')[0]).toMatch(/\| n \| big \| era \|$/);
    expect(md).toMatch(/\| 5 -> 9 \| 1 -> 2 \|/);
  });

  it('reports a field a side could not compute as missing', () => {
    const a = { 'x:1': rec({ fields: { n: 1 } }) };
    const b = { 'x:1': rec() };
    expect(compare(a, b).rows[0].fields.n).toEqual(['1', '-']);
  });
});

describe('pair.js', () => {
  it('a checkout against itself ends identically on every seed', () => {
    const r = spawnSync(process.execPath, [resolve('scripts/events/pair.js'), '--a', '.', '--bots', 'balanced', '--seeds', '2', '--fields', '({ staff: s.staff.length })'], { encoding: 'utf8', timeout: 120000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\| balanced \| 2\/2 \| \d+% -> \d+% \| 0 \/ 0 \|/);
    expect(r.stdout).toMatch(/2 paired runs/);
  });

  it('refuses a --fields expression that is not JS before playing anything', () => {
    const r = spawnSync(process.execPath, [resolve('scripts/events/pair.js'), '--a', '.', '--bots', 'balanced', '--seeds', '1', '--fields', '({ '], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).not.toBe(0);
  });
});

describe('pair-report field and run-set handling', () => {
  it('splits --fields into one expression per name, at top-level commas only', () => {
    expect(parseFields('({ a: s.x, b: [1, 2].length, c: f(1, 2) })')).toEqual([{ name: 'a', expr: 's.x' }, { name: 'b', expr: '[1, 2].length' }, { name: 'c', expr: 'f(1, 2)' }]);
    expect(parseFields('n: 1, m: "a,b"').map((f) => f.name)).toEqual(['n', 'm']);
    expect(parseFields('')).toEqual([]);
  });

  it('rejects a part that is not name: expression, or not JS', () => {
    expect(() => parseFields('just_an_expression')).toThrow(/not name: expression/);
    expect(() => parseFields('a: s.x, b: 1 +')).toThrow(/b is not a JS expression/);
  });

  it('lists runs present on one side only and compares the rest', () => {
    const { runs, onlyA, onlyB, rows } = compare({ 'x:1': rec(), 'x:2': rec() }, { 'x:1': rec(), 'x:3': rec() });
    expect([runs, onlyA, onlyB]).toEqual([1, ['x:2'], ['x:3']]);
    expect(rows[0].runs).toBe(1);
  });
});

describe('pair.js arguments and fields', () => {
  const run = (...args) => spawnSync(process.execPath, [resolve('scripts/events/pair.js'), ...args], { encoding: 'utf8', timeout: 120000 });

  it('exits 2 with one line for a --b that is not a checkout', () => {
    const r = run('--a', '.', '--b', '/nonexistent/dir', '--bots', 'balanced', '--seeds', '1');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/pair: --b .* is not a checkout/);
    expect(r.stderr).not.toMatch(/at file:/);
  });

  it('exits 2 for a --fields part that is not name: expression', () => {
    const r = run('--a', '.', '--bots', 'balanced', '--seeds', '1', '--fields', 'oops');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--fields: /);
  });

  it('one field that throws on a run blanks only that field', () => {
    const r = run('--a', '.', '--bots', 'balanced', '--seeds', '2', '--fields', 'staff: s.staff.length, bad: s.nothing.here');
    expect(r.status).toBe(0);
    const header = r.stdout.split('\n')[0], row = r.stdout.split('\n')[2];
    expect(header).toMatch(/\| staff \| bad \|$/);
    expect(row).toMatch(/\| \d+ -> \d+ \| - -> - \|$/);
  });
});

