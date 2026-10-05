// Shared parts of the motion tracking runner: probing a video, finding cuts, cutting shots, cache keys.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

const rational = (s) => { const [a, b] = String(s).split('/').map(Number); return b ? a / b : a; };

function ffprobeStream(video, extra) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', ...extra, '-show_entries', 'stream=r_frame_rate,width,height,nb_frames,duration,nb_read_frames', '-of', 'json', video], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffprobe could not start: ${r.error.message}`);
  let s;
  try { s = JSON.parse(r.stdout).streams?.[0]; } catch { s = undefined; }
  if (r.status !== 0 || !s) throw new Error(`cannot read a video stream from ${video}: ${(r.stderr || '').trim().split('\n')[0] || 'no stream'}`);
  return s;
}

// Frame rate, size and frame count of the first video stream. The count comes from the container (frame
// count, else duration times rate) so a short range of a long video never decodes the whole file; only a
// stream with neither is counted by decoding. Throws a readable error for a file ffprobe cannot read.
export function probe(video) {
  let s = ffprobeStream(video, []);
  const fps = rational(s.r_frame_rate);
  let frames = Number(s.nb_frames);
  if (!(frames > 0)) frames = Math.round(Number(s.duration) * fps);
  if (!(frames > 0)) { s = ffprobeStream(video, ['-count_frames']); frames = Number(s.nb_read_frames); }
  return { fps, width: s.width, height: s.height, frames };
}

// Absolute frame indices where a new shot starts inside [startFrame, endFrame), from ffmpeg's scene score.
export function detectCuts(video, { startFrame, endFrame, fps, threshold = 0.4 }) {
  const args = ['-v', 'info', '-ss', String(startFrame / fps), '-i', video, '-frames:v', String(endFrame - startFrame), '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`ffmpeg could not start: ${r.error.message}`);
  const cuts = [];
  for (const m of (r.stderr || '').matchAll(/pts_time:([0-9.]+)/g)) {
    const f = startFrame + Math.round(Number(m[1]) * fps);
    if (f > startFrame && f < endFrame && !cuts.includes(f)) cuts.push(f);
  }
  return cuts.sort((a, b) => a - b);
}

// Shots [{start, end}] (end exclusive) from the cuts; a shot shorter than minLen frames is skipped and
// listed in `skipped`.
export function shotsFromCuts(startFrame, endFrame, cuts, minLen) {
  const edges = [startFrame, ...cuts, endFrame];
  const shots = [], skipped = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const s = { start: edges[i], end: edges[i + 1] };
    (s.end - s.start >= minLen ? shots : skipped).push(s);
  }
  return { shots, skipped };
}

export function cacheKey(videoSha, shot, models, options = {}) {
  return createHash('sha256').update(JSON.stringify({ v: videoSha, s: shot.start, e: shot.end, m: models, o: options })).digest('hex').slice(0, 32);
}

// Cuts one shot to its own constant-rate clip (frame accurate, near lossless) for the worker to read.
export function cutShotClip(video, shot, fps, out) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(shot.start / fps), '-i', video, '-frames:v', String(shot.end - shot.start), '-an', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed cutting shot ${shot.start}-${shot.end}: ${(r.stderr || '').trim().split('\n').pop()}`);
}
