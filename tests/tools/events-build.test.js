import { afterAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { play } from '../../scripts/events/play.js';
import { simHash } from '../../scripts/events/lib.js';
import { referencePlay } from './event-index-reference.js';

const root = mkdtempSync(join(tmpdir(), 'events-build-'));
const build = resolve('scripts/events/build.js');
afterAll(() => rmSync(root, { recursive: true, force: true }));
const directory = (name) => { const d = join(root, name); mkdirSync(d, { recursive: true }); return d; };
const run = (cache, args = []) => spawnSync(process.execPath, [build, ...args], {
  env: { ...process.env, HITL_EVENTS_DIR: cache }, encoding: 'utf8', timeout: 120000,
});
const compare = (a, b) => {
  const files = readdirSync(join(a, 'snapshots')).sort();
  expect(readdirSync(join(b, 'snapshots')).sort()).toEqual(files);
  for (const f of files) expect(readFileSync(join(a, 'snapshots', f)).equals(readFileSync(join(b, 'snapshots', f))), f).toBe(true);
  return files;
};

describe('event index snapshots', () => {
  it('replays exactly the states a single pass captures, including pre-tick and era snapshots', async () => {
    const a = directory('reference'), b = directory('replay');
    mkdirSync(join(a, 'snapshots')); mkdirSync(join(b, 'snapshots'));
    let rows = [];
    for (const bot of ['balanced', 'sensible', 'allHumans', 'automateAll', 'recklessHumans', 'squads']) {
      const args = { seed: 7, bot, weeks: bot === 'balanced' ? 1040 : 120 };
      const expected = await referencePlay({ ...args, dir: a });
      const actual = play({ ...args, dir: b });
      expect(JSON.stringify(actual.rows)).toBe(JSON.stringify(expected));
      rows.push(...actual.rows);
    }
    expect(rows.some((r) => r.preTick)).toBe(true);
    expect(rows.some((r) => r.type === 'era' && r.snapshot)).toBe(true);
    expect(compare(a, b).length).toBeGreaterThan(10);
  }, 120000);

  it('writes identical index and snapshot bytes with one or several persistent workers', () => {
    const a = directory('serial'), b = directory('parallel');
    const args = ['--seeds', '1-3', '--bots', 'balanced,sensible', '--weeks', '80'];
    for (const [cache, jobs] of [[a, '1'], [b, '3']]) {
      const r = run(cache, [...args, '--jobs', jobs]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    }
    const hash = simHash();
    expect(readFileSync(join(a, hash, 'events.jsonl.gz')).equals(readFileSync(join(b, hash, 'events.jsonl.gz')))).toBe(true);
    compare(join(a, hash), join(b, hash));
    expect(run(a).stdout).toContain('already exists');
  }, 120000);
});

describe('event index build failures', () => {
  it.each([
    ['--jobs', '0'], ['--jobs', 'NaN'], ['--jobs', '1.5'], ['--weeks', '-1'],
    ['--seeds', '4-1'], ['--seeds', '1,1'], ['--bots', '../../x'], ['--bots', 'missing'],
    ['--jobs'], ['--unknown'],
  ])('refuses bad input before creating a cache: %s %s', (...args) => {
    const cache = directory(`bad-${args.join('').replaceAll('/', '_')}`);
    const r = run(cache, args);
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toMatch(/^events: /);
    expect(readdirSync(cache)).toEqual([]);
  });

  it.each([[false, 'SIGINT'], [true, 'SIGTERM']])('interrupts without publishing partial files, existing index: %s, signal: %s', async (force, stop) => {
    const cache = directory(force ? 'interrupt-force' : 'interrupt-cold');
    const hash = simHash();
    if (force) {
      const r = run(cache, ['--seeds', '1', '--bots', 'balanced', '--weeks', '20']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    }
    const index = join(cache, hash, 'events.jsonl.gz');
    const previous = force ? readFileSync(index) : null;
    const child = spawn(process.execPath, [build, '--jobs', '1', ...(force ? ['--force'] : [])], {
      env: { ...process.env, HITL_EVENTS_DIR: cache }, stdio: 'ignore',
    });
    const exited = once(child, 'exit');
    let timer;
    try {
      await new Promise((res, rej) => {
        const start = Date.now();
        timer = setInterval(() => {
          const staging = readdirSync(cache).find((d) => d.startsWith('.build-'));
          if (staging && existsSync(join(cache, staging, 'snapshots')) && readdirSync(join(cache, staging, 'snapshots')).length) res();
          else if (Date.now() - start > 20000 || child.exitCode !== null) rej(new Error('build did not reach snapshot writes'));
        }, 20);
      });
      clearInterval(timer);
      child.kill(stop);
      const [code, signal] = await exited;
      expect({ code, signal }).toEqual({ code: stop === 'SIGINT' ? 130 : 143, signal: null });
      expect(readdirSync(cache).filter((d) => d.startsWith('.build-'))).toEqual([]);
      if (force) expect(readFileSync(index).equals(previous)).toBe(true);
      else {
        expect(existsSync(index)).toBe(false);
        const query = spawnSync(process.execPath, [resolve('scripts/events/find.js'), 'printer_jam', '--json'], {
          env: { ...process.env, HITL_EVENTS_DIR: cache }, encoding: 'utf8', timeout: 10000,
        });
        expect(query.status).toBe(2);
        expect(JSON.parse(query.stdout).kind).toBe('no-index');
      }
      const retry = run(cache, ['--seeds', '1', '--bots', 'balanced', '--weeks', '20']);
      expect(retry.status, retry.stdout + retry.stderr).toBe(0);
      expect(retry.stdout.includes('already exists')).toBe(force);
    } finally {
      clearInterval(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 60000);
});

it('keys raw snapshots by simulation and builder inputs, independent of the save/load adapter', () => {
  const checkout = directory('hash-checkout');
  for (const path of ['src/sim', 'src/data', 'src/save', 'scripts/events']) cpSync(resolve(path), join(checkout, path), { recursive: true });
  const hash = simHash(checkout);
  writeFileSync(join(checkout, 'src/save/save.js'), '// save adapter\n');
  expect(simHash(checkout)).toBe(hash);
  writeFileSync(join(checkout, 'src/data/events.js'), '// event definitions\n');
  expect(simHash(checkout)).not.toBe(hash);
  const dataHash = simHash(checkout);
  writeFileSync(join(checkout, 'scripts/events/play.js'), '// snapshot extraction\n');
  expect(simHash(checkout)).not.toBe(dataHash);
  const playHash = simHash(checkout);
  writeFileSync(join(checkout, 'scripts/events/build.js'), '// index assembly\n');
  expect(simHash(checkout)).not.toBe(playHash);
  const buildHash = simHash(checkout);
  writeFileSync(join(checkout, 'src/sim/tick.js'), '// simulation step\n');
  expect(simHash(checkout)).not.toBe(buildHash);
  rmSync(join(checkout, 'scripts/events/play.js'));
  expect(simHash(checkout)).toMatch(/^[a-f0-9]{16}$/);
});
