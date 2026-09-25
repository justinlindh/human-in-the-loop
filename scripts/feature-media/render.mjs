#!/usr/bin/env node
// Renders feature media from scripts/feature-media/manifest.js: each item is a capture.js item (so capture.js
// records it through the real game loop), plus the files to make from the recording:
//   out: [{ path, size, crop?, from?, seconds?, fps?, loop?, poster?, webm? }]
//     path     where the file goes under --out (its extension picks the kind: .webp still, .mp4 clip)
//     size     WxH of the file; the recording is cropped (crop: { x, y, w, h }, fractions of the
//              frame) then scaled and centre-cut to it
//     from     seconds into the recording: a still takes that frame (it must be one of the item's
//              screenshots), a clip starts there
//     seconds  a clip's length; fps its frame rate (default 30)
//     loop     'xfade' (the default) blends the last loop seconds into the first, so the clip loops
//              without a jump; 'none' leaves it as recorded
//     poster   a .webp path for the clip's first frame; webm: true adds a VP9 copy next to the MP4
// npm run feature-media -- [--only id,id] [--out shots/feature-media] [--compare <dir>] [--keep-raw]
//   --compare  prints each file's size next to the same path in <dir> (a site checkout, say)
// The recording is 1920x1080 at 30 fps; capture.js takes a GPU render slot.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const MANIFEST = resolve(opt('manifest', 'scripts/feature-media/manifest.js'));
const OUT = resolve(opt('out', 'shots/feature-media'));
const RAW = join(OUT, '.raw');
const compare = opt('compare', null);
const { ITEMS } = await import(pathToFileURL(MANIFEST).href);
const only = opt('only', null)?.split(',');
const items = ITEMS.filter((it) => !only || only.includes(it.id));
if (!items.length) { console.error(`feature-media: nothing matches --only ${only}`); process.exit(1); }

// Encodes run niced, under a timeout, like every heavy job on the shared machine.
const run = (cmd, args, what) => {
  if (cmd === 'ffmpeg') { args = ['-n', '10', 'timeout', '600', 'ffmpeg', ...args]; cmd = 'nice'; }
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${what}: ${cmd} exited ${r.status}: ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout;
};
const W0 = 1920, H0 = 1080, FPS0 = 30;
// ffmpeg crop + scale + centre-cut to WxH.
const vf = (o) => {
  const [w, h] = o.size.split('x').map(Number);
  const c = o.crop ? `crop=${Math.round(o.crop.w * W0)}:${Math.round(o.crop.h * H0)}:${Math.round(o.crop.x * W0)}:${Math.round(o.crop.y * H0)},` : '';
  return `${c}scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;
};

mkdirSync(RAW, { recursive: true });
console.log(`feature-media: recording ${items.map((i) => i.id).join(', ')}`);
const cap = spawnSync('node', ['scripts/capture.js', '--manifest', MANIFEST, '--only', items.map((i) => i.id).join(','), '--out', RAW, '--size', `${W0}x${H0}`, '--fps', String(FPS0), '--no-webm'], { stdio: 'inherit' });
if (cap.status !== 0) { console.error(`feature-media: capture.js exited ${cap.status}`); process.exit(1); }
const index = JSON.parse(readFileSync(join(RAW, 'index.json'), 'utf8'));
const recorded = new Map(Object.entries(index.items ?? {}));

const rows = [];
let failed = 0;
for (const it of items) {
  const rec = recorded.get(it.id);
  for (const o of it.out ?? []) {
    const dest = join(OUT, o.path);
    mkdirSync(dirname(dest), { recursive: true });
    try {
      if (o.path.endsWith('.webp')) {
        const t = o.from ?? (it.screenshots ?? [0])[0];
        const png = join(RAW, `${it.id}-${Number(t).toFixed(1)}s.png`);
        if (!existsSync(png)) throw new Error(`no screenshot at ${t}s (the item's screenshots: ${JSON.stringify(it.screenshots)})`);
        run('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', vf(o), '-quality', String(o.quality ?? 82), dest], o.path);
      } else if (o.path.endsWith('.mp4')) {
        const mp4 = rec?.file && join(RAW, rec.file);
        if (!mp4 || !existsSync(mp4)) throw new Error('the item recorded no clip');
        const from = o.from ?? 0, len = o.seconds ?? (it.seconds - from), fps = o.fps ?? FPS0, x = o.loop === 'none' ? 0 : (o.xfade ?? 0.6);
        // A seamless loop: the clip's last x seconds are blended into its first x, then the middle follows.
        const graph = x > 0
          ? `[0:v]trim=${from}:${from + len},setpts=PTS-STARTPTS,fps=${fps},${vf(o)},split[a][b];[a]trim=0:${len - x},setpts=PTS-STARTPTS[body];[b]trim=${len - x}:${len},setpts=PTS-STARTPTS[tail];[body]split[h][m];[h]trim=0:${x},setpts=PTS-STARTPTS[head];[m]trim=${x}:${len - x},setpts=PTS-STARTPTS[mid];[tail][head]xfade=transition=fade:duration=${x}:offset=0[joint];[joint][mid]concat=n=2:v=1[v]`
          : `[0:v]trim=${from}:${from + len},setpts=PTS-STARTPTS,fps=${fps},${vf(o)}[v]`;
        run('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-filter_complex', graph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(o.crf ?? 24), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest], o.path);
        if (o.webm) run('ffmpeg', ['-v', 'error', '-y', '-i', dest, '-an', '-c:v', 'libvpx-vp9', '-crf', String(o.webmCrf ?? 36), '-b:v', '0', '-row-mt', '1', dest.replace(/\.mp4$/, '.webm')], `${o.path} (webm)`);
        if (o.poster) {
          const p = join(OUT, o.poster); mkdirSync(dirname(p), { recursive: true });
          run('ffmpeg', ['-v', 'error', '-y', '-i', dest, '-frames:v', '1', '-quality', '82', p], o.poster);
        }
      } else throw new Error('the path must end in .webp or .mp4');
      const extra = [o.path.endsWith('.mp4') && o.webm ? o.path.replace(/\.mp4$/, '.webm') : null, o.poster].filter(Boolean);
      for (const p of [o.path, ...extra]) {
        const size = statSync(join(OUT, p)).size;
        const was = compare && existsSync(join(compare, p)) ? statSync(join(compare, p)).size : null;
        rows.push({ item: it.id, path: p, kb: Math.round(size / 1024), wasKb: was == null ? null : Math.round(was / 1024) });
      }
    } catch (e) { failed++; console.log(`FAIL ${it.id} -> ${o.path}: ${e.message}`); }
  }
}
if (!argv.includes('--keep-raw')) rmSync(RAW, { recursive: true, force: true });
console.log(`\n| file | KB |${compare ? ' before KB |' : ''}\n|---|---|${compare ? '---|' : ''}`);
for (const r of rows) console.log(`| ${r.path} | ${r.kb} |${compare ? ` ${r.wasKb ?? 'new'} |` : ''}`);
const tot = rows.reduce((a, r) => a + r.kb, 0), was = rows.reduce((a, r) => a + (r.wasKb ?? 0), 0);
console.log(`\nfeature-media: ${rows.length} file(s), ${tot} KB${compare ? ` (the same paths were ${was} KB)` : ''} in ${OUT}${failed ? `; ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
