import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { compare, markdown } from '../../scripts/events/pair-report.js';

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
