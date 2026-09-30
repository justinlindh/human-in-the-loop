import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { simHash } from '../../scripts/events/lib.js';
import { referencePlay } from './event-index-reference.js';
import { build, compareSnapshots, run, shortArgs, shortRun, workspace } from './event-index-fixture.js';

const { directory, cleanup } = workspace();
afterAll(cleanup);
const fixture = directory('fixture'), hash = simHash();
beforeAll(() => {
  const r = run(fixture, shortArgs);
  expect(r.status, r.stdout + r.stderr).toBe(0);
});

async function interruptBuild(cache, stop, force = false) {
  const child = spawn(process.execPath, [build, ...shortArgs, '--seeds', '1-100', ...(force ? ['--force'] : [])], {
    env: { ...process.env, HITL_EVENTS_DIR: cache }, stdio: 'ignore',
  });
  const exited = once(child, 'exit');
  let timer;
  try {
    const staging = await new Promise((res, rej) => {
      const start = Date.now();
      timer = setInterval(() => {
        const name = readdirSync(cache).find((d) => d.startsWith('.build-'));
        if (name && existsSync(join(cache, name, 'snapshots')) && readdirSync(join(cache, name, 'snapshots')).length) res(name);
        else if (Date.now() - start > 20000 || child.exitCode !== null || child.signalCode !== null) rej(new Error('build did not reach snapshot writes'));
      }, 10);
    });
    clearInterval(timer);
    child.kill(stop);
    const [code, signal] = await exited;
    expect({ code, signal }).toEqual(stop === 'SIGKILL'
      ? { code: null, signal: stop }
      : { code: stop === 'SIGINT' ? 130 : 143, signal: null });
    return { staging: join(cache, staging), pid: child.pid };
  } finally {
    clearInterval(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
  }
}

describe('event index snapshots', () => {
  it('replays decision and pre-tick snapshots byte for byte against a single pass', async () => {
    const a = directory('reference'), b = join(fixture, hash);
    mkdirSync(join(a, 'snapshots'));
    const expected = await referencePlay({ ...shortRun, dir: a });
    const json = gunzipSync(readFileSync(join(b, 'events.jsonl.gz'))).toString();
    expect(json).toBe(expected.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const rows = json.trim().split('\n').map(JSON.parse);
    expect(rows.some((r) => r.preTick)).toBe(true);
    expect(compareSnapshots(a, b).length).toBeGreaterThan(0);
  });

  it('reuses the completed fixture', () => {
    const r = run(fixture);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('already exists');
  });
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
    if (force) cpSync(fixture, cache, { recursive: true });
    const index = join(cache, hash, 'events.jsonl.gz');
    const previous = force ? readFileSync(index) : null;
    await interruptBuild(cache, stop, force);
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
    const retry = run(cache, shortArgs);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    expect(retry.stdout.includes('already exists')).toBe(force);
  }, 60000);

  it('reaps an aged SIGKILLed build on cache reuse and cold builds, preserving live or recent staging', async () => {
    const cache = directory('reap');
    cpSync(fixture, cache, { recursive: true });
    const { staging, pid } = await interruptBuild(cache, 'SIGKILL', true);
    expect(existsSync(staging)).toBe(true);
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const live = join(cache, `.build-${hash}-${process.pid}-active`);
    const unknown = join(cache, `.build-${hash}-no-owner`);
    const linked = join(cache, `.build-${hash}-${pid}-linked`);
    for (const dir of [live, unknown]) { mkdirSync(dir); utimesSync(dir, old, old); }
    symlinkSync(unknown, linked, 'dir');
    const reused = run(cache);
    expect(reused.status, reused.stdout + reused.stderr).toBe(0);
    expect(reused.stdout).toContain('already exists');
    expect(existsSync(staging)).toBe(true);
    utimesSync(staging, old, old);
    const reaped = run(cache);
    expect(reaped.status, reaped.stdout + reaped.stderr).toBe(0);
    expect(reaped.stdout).toContain('already exists');
    expect(existsSync(staging)).toBe(false);
    const backup = `${staging}-previous`;
    mkdirSync(backup); utimesSync(backup, old, old);
    rmSync(join(cache, hash), { recursive: true });
    const rebuilt = run(cache, shortArgs);
    expect(rebuilt.status, rebuilt.stdout + rebuilt.stderr).toBe(0);
    expect(existsSync(backup)).toBe(false);
    for (const dir of [live, unknown, linked]) expect(existsSync(dir), dir).toBe(true);
    expect(readFileSync(join(cache, hash, 'events.jsonl.gz')).equals(readFileSync(join(fixture, hash, 'events.jsonl.gz')))).toBe(true);
    compareSnapshots(join(fixture, hash), join(cache, hash));
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
