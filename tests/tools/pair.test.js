import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { makeTemp } from '../../scripts/tools/tmp.mjs';
import { compare, markdown, parseFields, sideKey } from '../../scripts/events/pair-report.js';

const PAIR = resolve('scripts/events/pair.js');
// Every pair.js these tests start caches side a here, never in the team's cache.
process.env.HITL_PAIR_CACHE_DIR = makeTemp('pair-cache-');
afterAll(() => rmSync(process.env.HITL_PAIR_CACHE_DIR, { recursive: true, force: true }));

describe('sideKey', () => {
  const parts = { files: [['src/sim/a.js', 'id1'], ['src/data/b.json', 'id2']], bots: ['x', 'y'], seeds: 5, startEra: null, fields: [], script: 's', node: 'v1' };
  it('ignores the order of files and bots, and nothing else', () => {
    const key = sideKey(parts);
    expect(sideKey({ ...parts, files: [...parts.files].reverse(), bots: ['y', 'x'] })).toBe(key);
    for (const change of [{ files: [['src/sim/a.js', 'id9'], parts.files[1]] }, { seeds: 6 }, { bots: ['x'] }, { startEra: 'agents' }, { fields: [{ name: 'n', expr: '1' }] }, { script: 't' }, { node: 'v2' }]) {
      expect(sideKey({ ...parts, ...change })).not.toBe(key);
    }
  });
});

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
  it('refuses a --fields expression that is not JS before playing anything', () => {
    const r = spawnSync(process.execPath, [resolve('scripts/events/pair.js'), '--a', '.', '--bots', 'balanced', '--seeds', '1', '--fields', '({ '], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).not.toBe(0);
  });

  it('prints usage and exits 0 for --help and -h without playing', () => {
    for (const flag of ['--help', '-h']) {
      const r = spawnSync(process.execPath, [PAIR, flag], { encoding: 'utf8', timeout: 20000 });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/usage: node scripts\/events\/pair\.js/);
    }
  });

  it('exits 2 with the usage on an unrecognised flag or stray argument', () => {
    for (const args of [['--seed', '5'], ['--seeds', '1', 'extra']]) {
      const r = spawnSync(process.execPath, [PAIR, ...args], { encoding: 'utf8', timeout: 20000 });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/unrecognised argument[\s\S]*usage:/);
    }
  });

  it('exits 2 when a flag has no value, before playing anything', () => {
    for (const args of [['--a'], ['--seeds', '2', '--bots', 'balanced', '--b'], ['--seeds', '--bots', 'balanced']]) {
      const r = spawnSync(process.execPath, [PAIR, ...args], { encoding: 'utf8', timeout: 20000 });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/needs a value[\s\S]*usage:/);
    }
  });

  it('exits 2 on a bare --start-era', () => {
    const r = spawnSync(process.execPath, [PAIR, '--a', '.', '--seeds', '1', '--start-era'], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(2);
  });

  it('exits 2 on an unknown --start-era before playing anything', () => {
    const r = spawnSync(process.execPath, [PAIR, '--a', '.', '--bots', 'balanced', '--seeds', '1', '--start-era', 'nope'], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown starting era/);
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

  it('a refused argument leaves no worktree and no temporary directory behind', () => {
    // The runs get a scratch directory (HITL_TMP) of their own, so other pair.js jobs on the machine
    // cannot change what is counted, and a TMPDIR standing in for the system's, which stays empty.
    const tmp = makeTemp('pair-test-'), sys = makeTemp('pair-sys-');
    const runIn = (...args) => spawnSync(process.execPath, [PAIR, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, HITL_TMP: tmp, TMPDIR: sys } });
    const list = () => spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.startsWith(`worktree ${tmp}/`));
    try {
      expect(runIn('--bots', 'balanced', '--seeds', '1', '--fields', 'oops').status).toBe(2);
      expect(runIn('--a', '.', '--b', '/nonexistent/dir', '--bots', 'balanced', '--seeds', '1').status).toBe(2);
      expect(runIn('--a', '.', '--bots', 'balanced', '--seeds', '1', '--fields', 'oops').status).toBe(2);
      expect([list(), readdirSync(tmp), readdirSync(sys)]).toEqual([[], [], []]);
    } finally { for (const d of [tmp, sys]) rmSync(d, { recursive: true, force: true }); }
  });
});

describe('pair.js run records', () => {
  it('logs one record per side with the games it played and its CPU, and the total on the run', () => {
    const dir = makeTemp('pair-timings-');
    const file = join(dir, 'timings.jsonl');
    try {
      const r = spawnSync(process.execPath, [PAIR, '--a', '.', '--b', '.', '--bots', 'automateAll', '--seeds', '2', '--jobs', '1'],
        { encoding: 'utf8', timeout: 120000, env: { ...process.env, HITL_TIMINGS: file, HITL_NO_CHECK_CACHE: '1' } });
      expect(r.status).toBe(0);
      const recs = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'run');
      const sides = recs.filter((x) => x.tool === 'pair-side');
      expect(sides.map((x) => x.side).sort()).toEqual(['a', 'b']);
      for (const s of sides) { expect(s.games).toBe(2); expect(s.cpu_s).toBeGreaterThan(0); }
      const run = recs.find((x) => x.tool === 'pair');
      expect(run.games).toBe(4);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120000);
});

describe('pair.js --screen', () => {
  const run = (...args) => spawnSync(process.execPath, [PAIR, ...args], { encoding: 'utf8', timeout: 300000, env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
  const tables = (out) => out.split('\n').filter((l) => l.startsWith('| bot |')).length;

  it('stops after the screen when every screened run is identical', () => {
    const r = run('--a', '.', '--b', '.', '--bots', 'automateAll', '--seeds', '3', '--screen', '1', '--jobs', '1');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/screen: 1\/1 runs identical on seeds 1-1; the 3-seed run is skipped/);
    expect(tables(r.stdout)).toBe(1);
  }, 300000);

  it('goes on to the full run with --expect change, even when the screen is identical', () => {
    const r = run('--a', '.', '--b', '.', '--bots', 'automateAll', '--seeds', '2', '--screen', '1', '--expect', 'change', '--jobs', '1');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/screen: .*--expect change: playing the 2-seed run/);
    expect(tables(r.stdout)).toBe(2);
    expect(r.stdout).toMatch(/2 paired runs/);
  }, 300000);

  it('goes on to the full run when the screen finds a difference', () => {
    const base = makeTemp('pair-screen-base-');
    try {
      cpSync('src', join(base, 'src'), { recursive: true });
      const f = join(base, 'src/sim/balance.js');
      writeFileSync(f, readFileSync(f, 'utf8').replace('hqDeskCap: 30,', 'hqDeskCap: 12,'));
      const r = run('--a', base, '--b', '.', '--bots', 'balanced', '--seeds', '2', '--screen', '1', '--jobs', '1');
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/screen: 0\/1 runs identical on seeds 1-1; playing the 2-seed run/);
      expect(tables(r.stdout)).toBe(2);
    } finally { rmSync(base, { recursive: true, force: true }); }
  }, 300000);

  it('refuses a screen that is not smaller than --seeds, and a bad --expect, before playing', () => {
    expect(run('--a', '.', '--bots', 'automateAll', '--seeds', '2', '--screen', '2').status).toBe(2);
    expect(run('--a', '.', '--bots', 'automateAll', '--seeds', '2', '--screen', '1', '--expect', 'maybe').status).toBe(2);
  });
});

