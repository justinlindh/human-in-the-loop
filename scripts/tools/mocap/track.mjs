#!/usr/bin/env node
// Motion tracking runner: a video range in, one JSON per shot out (people with stable ids, SOMA joint
// rotations and positions, per-joint trust, camera path). The GPU work is scripts/tools/mocap/worker/
// track_worker.py in the environment scripts/tools/mocap/setup.sh builds (HITL_MOCAP_HOME).
//   node scripts/tools/mocap/track.mjs --video <file> --out <dir> [--start <s>] [--end <s>] [--min-shot <frames>]
//        [--cut-threshold <0-1>] [--timeout <s>] [--no-camera] [--no-cache] [--no-lock] [--keep-work]
// Writes <dir>/index.json and <dir>/shot-<n>.json. Results are cached under HITL_MOCAP_CACHE
// (default ~/.cache/hitl-ci/mocap-cache) per (video hash, shot, model versions, options).
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTemp } from '../tmp.mjs';
import { cacheKey, cutShotClip, detectCuts, probe, sha256File, shotsFromCuts } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const USAGE = 'usage: node scripts/tools/mocap/track.mjs --video <file> --out <dir> [--start <s>] [--end <s>] [--min-shot <frames>] [--cut-threshold <0-1>] [--timeout <s>] [--no-camera] [--no-cache] [--no-lock] [--keep-work]';
const fail = (msg, code = 2) => { console.error(`track: ${msg}\n${USAGE}`); process.exit(code); };

const opts = { start: '0', 'min-shot': '12', 'cut-threshold': '0.4', timeout: '1800' };
const flags = new Set(['no-camera', 'no-cache', 'no-lock', 'keep-work']);
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) fail(`unexpected argument ${a}`);
  const k = a.slice(2);
  if (flags.has(k)) opts[k] = true;
  else if (['video', 'out', 'start', 'end', 'min-shot', 'cut-threshold', 'timeout'].includes(k)) { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); opts[k] = argv[++i]; }
  else fail(`unknown option ${a}`);
}
if (!opts.video) fail('--video is required');
if (!opts.out) fail('--out is required');
const num = (k) => { const n = Number(opts[k]); if (!Number.isFinite(n)) fail(`--${k} takes a number`); return n; };
const startS = num('start'), minShot = num('min-shot'), threshold = num('cut-threshold'), timeoutS = num('timeout');
if (startS < 0 || !(minShot >= 1) || !(threshold > 0 && threshold < 1) || !(timeoutS > 0)) fail('--start, --min-shot, --cut-threshold or --timeout is out of range');
const endS = opts.end === undefined ? undefined : num('end');
if (endS !== undefined && !(endS > startS)) fail('--end must be after --start');
if (!existsSync(opts.video) || !statSync(opts.video).isFile()) fail(`no such video: ${opts.video}`);

const home = process.env.HITL_MOCAP_HOME || join(homedir(), '.cache', 'hitl-mocap');
const cacheDir = process.env.HITL_MOCAP_CACHE || join(homedir(), '.cache', 'hitl-ci', 'mocap-cache');
const models = JSON.parse(readFileSync(join(HERE, 'models.json'), 'utf8'));
// A worker command override (a stub in tests); otherwise the environment's python on the real worker.
const workerCmd = process.env.HITL_MOCAP_WORKER_CMD ? process.env.HITL_MOCAP_WORKER_CMD.split(' ') : [join(home, 'venv', 'bin', 'python'), join(HERE, 'worker', 'track_worker.py')];
if (!process.env.HITL_MOCAP_WORKER_CMD && !existsSync(workerCmd[0])) fail(`no environment at ${home}: run scripts/tools/mocap/setup.sh first`, 3);

let info;
try { info = probe(opts.video); } catch (e) { fail(e.message); }
const startFrame = Math.round(startS * info.fps);
const endFrame = Math.min(info.frames, endS === undefined ? info.frames : Math.round(endS * info.fps));
if (startFrame >= endFrame) fail(`the range starts at frame ${startFrame} but the video has ${info.frames} frames`);

const out = resolve(opts.out);
mkdirSync(out, { recursive: true });
const work = makeTemp('mocap-');
let child = null;
const cleanup = () => { if (!opts['keep-work']) rmSync(work, { recursive: true, force: true }); };
const stop = (sig, code) => { if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } } cleanup(); console.error(`track: stopped by ${sig}`); process.exit(code); };
process.on('SIGINT', () => stop('SIGINT', 130));
process.on('SIGTERM', () => stop('SIGTERM', 143));

function runWorker(clip, jsonOut, shot) {
  const wargs = [...workerCmd.slice(1), '--clip', clip, '--out', jsonOut, '--frame-offset', String(shot.start), '--fps', String(info.fps), '--width', String(info.width), '--height', String(info.height), '--models', join(HERE, 'models.json')];
  if (opts['no-camera']) wargs.push('--no-camera');
  const cmd = ['nice', '-n', '10', 'timeout', '-s', 'TERM', String(timeoutS), workerCmd[0], ...wargs];
  const full = opts['no-lock'] ? cmd : [join(ROOT, 'scripts', 'with-render-lock.sh'), '--gpu', ...cmd];
  return new Promise((done) => {
    child = spawn(full[0], full.slice(1), { detached: true, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, HITL_MOCAP_HOME: home } });
    child.on('error', (e) => { console.error(`track: cannot start the worker: ${e.message}`); done(127); });
    child.on('close', (code, sig) => { child = null; done(code ?? (sig ? 128 : 1)); });
  });
}

function validShot(path) {
  try {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    return j.format === 'hitl-mocap-shot' && j.version === 1 && Array.isArray(j.people) && j.shot && Array.isArray(j.joints) ? j : null;
  } catch { return null; }
}

const videoSha = await sha256File(opts.video);
const cuts = detectCuts(opts.video, { startFrame, endFrame, fps: info.fps, threshold });
const { shots, skipped } = shotsFromCuts(startFrame, endFrame, cuts, minShot);
console.error(`track: frames ${startFrame}-${endFrame} at ${info.fps} fps, ${shots.length} shot(s), ${cuts.length} cut(s)${skipped.length ? `, ${skipped.length} shot(s) under ${minShot} frames skipped` : ''}`);
mkdirSync(cacheDir, { recursive: true });
const index = { format: 'hitl-mocap-index', version: 1, video: { sha256: videoSha, fps: info.fps, width: info.width, height: info.height }, range: { startFrame, endFrame }, models, shots: [], skipped };
let failed = false;
for (const [n, shot] of shots.entries()) {
  const key = cacheKey(videoSha, shot, models, { camera: !opts['no-camera'] });
  const cached = join(cacheDir, `${key}.json`);
  const dest = join(out, `shot-${n}.json`);
  let status = 'miss', json = null;
  if (!opts['no-cache'] && existsSync(cached) && (json = validShot(cached))) { copyFileSync(cached, dest); status = 'hit'; }
  else {
    const clip = join(work, `shot-${n}.mp4`), res = join(work, `shot-${n}.json`);
    try { cutShotClip(opts.video, shot, info.fps, clip); } catch (e) { console.error(`track: ${e.message}`); failed = true; break; }
    const t0 = Date.now();
    const code = await runWorker(clip, res, shot);
    json = code === 0 ? validShot(res) : null;
    if (!json) { console.error(`track: the worker ${code === 0 ? 'wrote no valid shot file' : `exited ${code}${code === 124 ? ' (timeout)' : ''}`} for shot ${n} (frames ${shot.start}-${shot.end})`); failed = true; break; }
    renameSync(res, `${cached}.part`); renameSync(`${cached}.part`, cached);
    copyFileSync(cached, dest);
    console.error(`track: shot ${n} tracked in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  index.shots.push({ index: n, start: shot.start, end: shot.end, file: `shot-${n}.json`, cache: status, people: json.people.length });
}
if (!failed) writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n');
cleanup();
if (failed) process.exit(1);
console.log(`track: ok, ${index.shots.length} shot(s) in ${out} (${index.shots.filter((s) => s.cache === 'hit').length} from cache)`);
