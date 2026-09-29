import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseRow, diffValues, compareRows } from '../../scripts/studio/parity.mjs';

const PARITY = resolve(__dirname, '../../scripts/studio/parity.mjs');
const run = (...args) => spawnSync(process.execPath, [PARITY, ...args], { encoding: 'utf8', timeout: 60000 });
const echo = (...rows) => `node -e ${JSON.stringify(`console.log(${JSON.stringify(rows.join('\n'))})`)}`;

describe('parity rows', () => {
  it('splits a line into a name, a status and its numbers', () => {
    expect(parseRow('CLIP ok   desk:f1:typing {"gap":0.016}')).toEqual({ name: 'CLIP desk:f1:typing', value: { gap: 0.016 }, status: 'ok' });
    expect(parseRow('plain line')).toEqual({ name: 'plain line', value: null, status: null });
  });

  it('matches numbers within a tolerance and names where they differ', () => {
    expect(diffValues({ a: 1, b: [1, 2] }, { a: 1.004, b: [1, 2] }, 0.005)).toEqual([]);
    expect(diffValues({ a: 1, b: [1, 2] }, { a: 1.1, b: [1, 3] }, 0.005)).toEqual(['a: 1 vs 1.1', 'b[1]: 2 vs 3']);
    expect(diffValues({ a: 1 }, { b: 1 }, 0)).toEqual(['a: only in old', 'b: only in new']);
  });

  it('compares two lists by name, status included', () => {
    const r = compareRows(['X ok a {"n":1}', 'X ok b {"n":1}', 'X ok c {"n":1}'], ['X ok a {"n":1}', 'X FAIL b {"n":1}', 'X ok d {"n":1}']);
    expect(r.matched).toBe(1);
    expect(r.differ).toEqual([{ name: 'X b', why: ['status: ok vs FAIL'] }]);
    expect(r.onlyOld).toEqual(['X c']);
    expect(r.onlyNew).toEqual(['X d']);
  });
});

describe('parity command', () => {
  const rows = (n) => echo(`R ok a {"n":${n}}`, 'R ok b {"n":2}');

  it('exits 0 when the rows match and 1 when one differs', () => {
    expect(run('--old', rows(1), '--new', rows(1), '--grep', '^R').status).toBe(0);
    const r = run('--old', rows(1), '--new', rows(2), '--grep', '^R');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('DIFF R a\n  n: 1 vs 2');
  });

  it('counts rows only the new tool prints, and rows only the old prints unless it covers a subset', () => {
    const old = echo('R ok a {"n":1}', 'R ok b {"n":2}'), fewer = echo('R ok a {"n":1}');
    expect(run('--old', old, '--new', fewer, '--grep', '^R').status).toBe(1);
    const subset = run('--old', old, '--new', fewer, '--grep', '^R', '--new-covers-only');
    expect(subset.status).toBe(0);
    expect(subset.stdout).toContain('NOT COVERED R b');
    expect(run('--old', fewer, '--new', old, '--grep', '^R', '--new-covers-only').status).toBe(1);
  });

  it('refuses bad input and a command that prints nothing', () => {
    expect(run().status).toBe(2);
    expect(run('--preset', 'nope').status).toBe(2);
    expect(run('--old', 'true', '--new', 'true', '--grep', '(').status).toBe(2);
    const r = run('--old', 'true', '--new', 'true', '--grep', '^R');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('printed no matching lines');
  });

  it('stops both commands when interrupted', async () => {
    const marker = `sleep ${31 + Math.floor(Math.random() * 1000) / 1000}`;
    const left = () => spawnSync('sh', ['-c', `ps -eo args | grep -c '[${marker[0]}]${marker.slice(1)}'`], { encoding: 'utf8' }).stdout.trim();
    const child = spawn(process.execPath, [PARITY, '--old', `${marker} & ${marker}`, '--new', 'true', '--grep', '^R'], { stdio: 'ignore' });
    const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
    for (let i = 0; i < 100 && left() === '0'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(Number(left())).toBeGreaterThan(0);
    child.kill('SIGTERM');
    const { code, signal } = await closed;
    expect(code === 143 || signal === 'SIGTERM').toBe(true);
    for (let i = 0; i < 40 && left() !== '0'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(left()).toBe('0');
  }, 20000);
});
