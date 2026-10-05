import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';
import { cacheKey, detectCuts, probe, shotsFromCuts } from '../../scripts/tools/mocap/lib.mjs';

const TRACK = resolve(__dirname, '../../scripts/tools/mocap/track.mjs');
const STUB = resolve(__dirname, 'mocap-stub-worker.mjs');
let dir, clip;
// The runner shells out to ffmpeg and ffprobe; a machine without them (the GitHub runner) skips the file,
// and local CI, which has them, runs it.
const HAVE_FFMPEG = ['ffmpeg', 'ffprobe'].every((c) => spawnSync(c, ['-version']).status === 0);

// A synthetic two-scene clip: 1 s of a test pattern, then 1 s of a different one, so there is one cut at frame 30.
beforeAll(() => {
  if (!HAVE_FFMPEG) return;
  dir = mkdtempSync(join(toolTmp(), 'mocap-test-'));
  clip = join(dir, 'synthetic.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=30:duration=1', '-f', 'lavfi', '-i', 'mandelbrot=size=160x120:rate=30', '-filter_complex', '[1:v]trim=duration=1,setpts=PTS-STARTPTS[b];[0:v][b]concat=n=2:v=1[o]', '-map', '[o]', '-pix_fmt', 'yuv420p', clip], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`could not make the synthetic clip: ${r.stderr}`);
});
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let n = 0;
// One isolated run: its own output, cache and scratch directories, the stub as the worker.
function run(args, env = {}) {
  const d = join(dir, `run${n++}`);
  mkdirSync(d, { recursive: true });
  const e = { ...process.env, HITL_MOCAP_WORKER_CMD: `node ${STUB}`, HITL_MOCAP_CACHE: join(d, 'cache'), HITL_TMP: join(d, 'tmp'), STUB_LOG: join(d, 'stub.log'), ...env };
  return { d, e, args: ['--video', clip, '--out', join(d, 'out'), '--no-lock', ...args] };
}
const go = async (r) => ({ ...(await spawnAsync('node', [TRACK, ...r.args], { timeout: 60000, env: r.e })), d: r.d });
const runs = (d) => (existsSync(join(d, 'stub.log')) ? readFileSync(join(d, 'stub.log'), 'utf8').trim().split('\n').length : 0);

describe.skipIf(!HAVE_FFMPEG)('shots', () => {
  it('finds the cut in a clip with two scenes', () => {
    const info = probe(clip);
    expect(info.frames).toBe(60);
    expect(info.fps).toBe(30);
    expect(detectCuts(clip, { startFrame: 0, endFrame: 60, fps: 30 })).toEqual([30]);
  });

  it('splits at cuts, skips shots under the minimum and keeps absolute frames', () => {
    expect(shotsFromCuts(10, 100, [11, 50], 8)).toEqual({ shots: [{ start: 11, end: 50 }, { start: 50, end: 100 }], skipped: [{ start: 10, end: 11 }] });
    expect(shotsFromCuts(0, 40, [], 8).shots).toEqual([{ start: 0, end: 40 }]);
  });

  it('keys the cache on the video, the shot, the model versions and the options', () => {
    const k = (v, s, m, o) => cacheKey(v, s, m, o);
    const base = k('a', { start: 0, end: 30 }, { x: 1 }, { camera: true });
    expect(k('a', { start: 0, end: 30 }, { x: 1 }, { camera: true })).toBe(base);
    for (const other of [k('b', { start: 0, end: 30 }, { x: 1 }, { camera: true }), k('a', { start: 1, end: 30 }, { x: 1 }, { camera: true }), k('a', { start: 0, end: 30 }, { x: 2 }, { camera: true }), k('a', { start: 0, end: 30 }, { x: 1 }, { camera: false })]) expect(other).not.toBe(base);
  });
});

describe.skipIf(!HAVE_FFMPEG)('track.mjs', () => {
  it('tracks each shot, writes an index with no local paths, and serves the second run from the cache', async () => {
    const r = run([]);
    const a = await go(r);
    expect(a.status, a.stderr).toBe(0);
    expect(a.stdout).toContain('2 shot(s)');
    const index = JSON.parse(readFileSync(join(r.d, 'out', 'index.json'), 'utf8'));
    expect(index.shots.map((s) => [s.start, s.end, s.cache, s.people])).toEqual([[0, 30, 'miss', 1], [30, 60, 'miss', 1]]);
    expect(index.video.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(index)).not.toContain(dir);
    expect(JSON.parse(readFileSync(join(r.d, 'out', 'shot-1.json'), 'utf8')).shot.start_frame).toBe(30);
    expect(runs(r.d)).toBe(2);
    const b = await go(r);
    expect(b.status, b.stderr).toBe(0);
    expect(b.stdout).toContain('2 from cache');
    expect(runs(r.d)).toBe(2);
    const c = await go({ ...r, args: [...r.args, '--no-cache'] });
    expect(c.status, c.stderr).toBe(0);
    expect(runs(r.d)).toBe(4);
    const d2 = await go({ ...r, args: [...r.args, '--no-camera'] });
    expect(d2.status, d2.stderr).toBe(0);
    expect(readFileSync(join(r.d, 'stub.log'), 'utf8')).toContain('nocam');
  });

  it('tracks only the range it is given', async () => {
    const r = run(['--start', '1', '--end', '2']);
    const a = await go(r);
    expect(a.status, a.stderr).toBe(0);
    const index = JSON.parse(readFileSync(join(r.d, 'out', 'index.json'), 'utf8'));
    expect(index.range).toEqual({ startFrame: 30, endFrame: 60 });
    expect(index.shots.length).toBe(1);
  });

  it('refuses bad input with exit 2 and a usage line', async () => {
    for (const args of [[], ['--video', 'nope.mp4', '--out', 'x'], ['--video', clip], ['--video', clip, '--out', 'x', '--bogus'], ['--video', clip, '--out', 'x', '--start', '2', '--end', '1'], ['--video', clip, '--out', 'x', '--start', 'abc'], ['--video', clip, '--out', 'x', '--cut-threshold', '2'], ['--video', clip, '--out', 'x', '--start', '99']]) {
      const a = await spawnAsync('node', [TRACK, ...args], { timeout: 30000, env: { ...process.env, HITL_MOCAP_WORKER_CMD: `node ${STUB}` } });
      expect(a.status, args.join(' ')).toBe(2);
      expect(a.stderr).toContain('usage:');
    }
    const notVideo = join(dir, 'text.txt');
    spawnSync('sh', ['-c', `echo hello > ${notVideo}`]);
    expect((await spawnAsync('node', [TRACK, '--video', notVideo, '--out', join(dir, 'o')], { timeout: 30000, env: { ...process.env, HITL_MOCAP_WORKER_CMD: `node ${STUB}` } })).status).toBe(2);
  });

  it('says to run setup when the environment is missing', async () => {
    const env = { ...process.env, HITL_MOCAP_HOME: join(dir, 'no-env') };
    delete env.HITL_MOCAP_WORKER_CMD;
    const a = await spawnAsync('node', [TRACK, '--video', clip, '--out', join(dir, 'o2')], { timeout: 30000, env });
    expect(a.status).toBe(3);
    expect(a.stderr).toContain('setup.sh');
  });

  it('fails with exit 1 and writes no index when the worker fails or writes a bad file', async () => {
    for (const env of [{ STUB_FAIL: '1' }, { STUB_BAD: '1' }]) {
      const r = run([], env);
      const a = await go(r);
      expect(a.status, JSON.stringify(env)).toBe(1);
      expect(existsSync(join(r.d, 'out', 'index.json'))).toBe(false);
      expect(existsSync(r.e.HITL_TMP) ? readdirSync(r.e.HITL_TMP) : []).toEqual([]);
    }
  });

  it('stops the worker, leaves no scratch directory and exits 130 on SIGINT', async () => {
    const r = run([], { STUB_SLEEP: '30000' });
    const { spawn } = await import('node:child_process');
    const p = spawn('node', [TRACK, ...r.args], { env: r.e, stdio: 'ignore' });
    const code = new Promise((done) => p.on('close', (c, s) => done(c ?? s)));
    for (let i = 0; i < 100 && !existsSync(join(r.d, 'stub.log')); i++) await new Promise((x) => setTimeout(x, 100));
    p.kill('SIGINT');
    expect(await code).toBe(130);
    await new Promise((x) => setTimeout(x, 300));
    expect(existsSync(r.e.HITL_TMP) ? readdirSync(r.e.HITL_TMP) : []).toEqual([]);
    const alive = spawnSync('sh', ['-c', `ps -eo args | grep "[m]ocap-stub-worker.mjs" | grep -c "${r.d}" || true`], { encoding: 'utf8' });
    expect(alive.stdout.trim()).toBe('0');
  });
});
