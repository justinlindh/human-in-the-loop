import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { readdirSync, mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Cases that play both sides or hold the base worktree: too slow for test:fast, run by local CI.
const PAIR = resolve('scripts/events/pair.js');
// Every pair.js these tests start caches side a here, never in the team's cache.
process.env.HITL_PAIR_CACHE_DIR = mkdtempSync(join(tmpdir(), 'pair-cache-'));
afterAll(() => rmSync(process.env.HITL_PAIR_CACHE_DIR, { recursive: true, force: true }));

describe('pair.js plays', () => {
  const run = (...args) => spawnSync(process.execPath, [PAIR, ...args], { encoding: 'utf8', timeout: 120000 });

  it('a checkout against itself ends identically on every seed', () => {
    const r = run('--a', '.', '--bots', 'balanced', '--seeds', '2', '--fields', '({ staff: s.staff.length })');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\| balanced \| 2\/2 \| \d+% -> \d+% \| 0 \/ 0 \|/);
    expect(r.stdout).toMatch(/2 paired runs/);
  });

  it('one field that throws on a run blanks only that field', () => {
    const r = run('--a', '.', '--bots', 'balanced', '--seeds', '2', '--fields', 'staff: s.staff.length, bad: s.nothing.here');
    expect(r.status).toBe(0);
    const header = r.stdout.split('\n')[0], row = r.stdout.split('\n')[2];
    expect(header).toMatch(/\| staff \| bad \|$/);
    expect(row).toMatch(/\| \d+ -> \d+ \| - -> - \|$/);
  });

  it('a run killed while it holds the base worktree removes it and its side processes', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pair-test-'));
    const list = () => spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.startsWith(`worktree ${tmp}/`));
    try {
      const child = spawn(process.execPath, [PAIR, '--bots', 'balanced', '--seeds', '400'], { stdio: 'ignore', env: { ...process.env, TMPDIR: tmp } });
      const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
      for (let i = 0; i < 400 && !list().length; i++) await new Promise((r) => setTimeout(r, 100));
      expect(list().length).toBeGreaterThan(0);
      child.kill('SIGTERM');
      // The handler exits 143; a loaded machine can also deliver the signal itself first.
      const { code, signal } = await closed;
      expect(code === 143 || signal === 'SIGTERM').toBe(true);
      expect(list()).toEqual([]);
      expect(readdirSync(tmp)).toEqual([]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }, 60000);
});

describe('side a cache', () => {
  // A scratch repository holding just the sim and its data, played as side a against this checkout.
  const base = mkdtempSync(join(tmpdir(), 'pair-base-'));
  const git = (...args) => spawnSync('git', ['-C', base, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
  const play = (extra = [], env = {}) => spawnSync(process.execPath, [PAIR, '--a', base, ...extra, '--bots', 'balanced', '--seeds', '2'], { encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } });
  const table = (r) => r.stdout.split('\n').filter((l) => l.startsWith('| balanced'));
  const cached = (r) => /side a read from the cache/.test(r.stdout);
  const cacheFiles = () => readdirSync(process.env.HITL_PAIR_CACHE_DIR).filter((n) => n.endsWith('.json'));

  beforeAll(() => {
    cpSync('src/sim', join(base, 'src/sim'), { recursive: true });
    cpSync('src/data', join(base, 'src/data'), { recursive: true });
    git('init', '-q'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('plays side a on a miss, reads it on a repeat, and prints the same table both times', () => {
    const first = play(), second = play();
    expect([first.status, second.status]).toEqual([0, 0]);
    expect([cached(first), cached(second)]).toEqual([false, true]);
    expect(table(second)).toEqual(table(first));
    expect(table(first)[0]).toMatch(/\| balanced \| 2\/2 /);
  });

  it('a different seed count, bot set or --fields is a miss', () => {
    play();
    expect(cached(play(['--seeds', '3']))).toBe(false);
    expect(cached(play(['--fields', 'n: s.staff.length + 1000']))).toBe(false);
    expect(cached(play(['--fields', 'n: s.staff.length + 1000']))).toBe(true);
  });

  it('a changed sim file on side a is a miss, and putting it back is a hit again', () => {
    play();
    const file = join(base, 'src/sim/rng.js');
    const original = readFileSync(file, 'utf8');
    writeFileSync(file, `${original}\n// changed\n`);
    try { expect(cached(play())).toBe(false); } finally { writeFileSync(file, original); }
    expect(cached(play())).toBe(true);
  });

  it('a file that is not sim or data, or a test file, does not change the key', () => {
    play();
    writeFileSync(join(base, 'README.md'), 'x');
    writeFileSync(join(base, 'src/sim/some.test.js'), 'x');
    try { expect(cached(play())).toBe(true); } finally { rmSync(join(base, 'README.md')); rmSync(join(base, 'src/sim/some.test.js')); }
  });

  it('HITL_NO_CHECK_CACHE=1 neither reads nor writes it', () => {
    const before = cacheFiles().length;
    const r = play(['--seeds', '4'], { HITL_NO_CHECK_CACHE: '1' });
    expect([r.status, cached(r), cacheFiles().length]).toEqual([0, false, before]);
  });

  it('says on stderr when side a cannot be cached, and still prints the table', () => {
    const blocked = join(process.env.HITL_PAIR_CACHE_DIR, 'blocked-file');
    writeFileSync(blocked, 'x');
    const r = play(['--seeds', '1'], { HITL_PAIR_CACHE_DIR: join(blocked, 'sub') });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/pair: cache: skipped \(could not write side a: /);
    expect(table(r)[0]).toMatch(/\| balanced \| 1\/1 /);
  });

  it('a damaged cache entry is played over, not trusted', () => {
    play(['--seeds', '5']);
    for (const n of cacheFiles()) writeFileSync(join(process.env.HITL_PAIR_CACHE_DIR, n), '{ not json');
    const r = play(['--seeds', '5']);
    expect([r.status, cached(r)]).toEqual([0, false]);
  });
});
