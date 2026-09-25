// One scene, one state change, stills or a clip: the shared helper for review stills and clips.
//
//   node blender/checks/scene.mjs --out shots/x.png [options]
//
//   --mock floor | --seed N [--week W]   the mock sim (default floor) or a real seeded game
//   --patch '<json>'                     applied to the state after warm-up (see applyPatch)
//   --pre '<json>'                       applied before warm-up (the "before" state)
//   --event '<json>'                     an event or list of events handed to the renderer with --patch
//   --focus x,y,z [--zoom Z]             ease the camera onto a world point
//   --frames N                           a clip of N frames (30 fps) after the patch; else one still
//   --before N                           clip frames captured before the patch (default 0)
//   --warm N                             frames stepped before anything is captured (default 60)
//   --settle N                           still mode: frames stepped after the patch (default 30)
//   --crop x,y,w,h                       crop every image (canvas pixels)
//   --report '<js>'                      an expression evaluated in the page at the end; printed as JSON
//   --size WxH (960x600)  --quality medium  --time 0.45  --paused  --software  --timeout 300
//
// Output: a still is written to --out. A clip writes --out as .mp4 (H.264), plus the frames in
// <out>-frames/. GPU rendering is the default (--software for SwiftShader); golden and clip checks
// do not use this helper.
//
// applyPatch: plain objects merge into the state; other values replace. Shorthands: era: 'agents'
// becomes { id, since }, props: [...] sets office.props, placed: [...] replaces office.placed, and
// place: [...] adds to it.
import { startHarness } from './harness.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function renderScene(H, o) {
  const [w, h] = (o.size ?? '960x600').split('x').map(Number);
  const q = new URLSearchParams({ quality: o.quality ?? 'medium' });
  if (o.seed != null) { q.set('seed', String(o.seed)); if (o.week) q.set('weeks', String(o.week)); } else q.set('mock', o.mock ?? 'floor');
  const { page, errors } = await H.openScene(q.toString(), { width: w, height: h, time: o.time ?? 0.45 });
  const images = await page.evaluate(async (o) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    R.perks.hold = true;
    const merge = (dst, src) => {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
        else dst[k] = v;
      }
    };
    const apply = (p) => {
      if (!p) return;
      const { era, props, placed, place, ...rest } = p;
      if (era) S.era = { id: era, since: S.week };
      if (props) S.office.props = props;
      if (placed) S.office.placed = placed;
      if (place) S.office.placed = [...S.office.placed, ...place];
      merge(S, rest);
    };
    const grab = () => {
      window.__step(1);
      const c = document.querySelector('canvas');
      if (!o.crop) return c.toDataURL('image/png');
      const [x, y, cw, ch] = o.crop;
      const t = document.createElement('canvas');
      t.width = cw; t.height = ch;
      t.getContext('2d').drawImage(c, x, y, cw, ch, 0, 0, cw, ch);
      return t.toDataURL('image/png');
    };
    apply(o.pre);
    if (o.paused) R.setSpeed(0);
    window.__step(o.warm ?? 60);
    // After warm-up: building the stage frames the camera on the whole office.
    if (o.focus) { R.focusAt(o.focus[0], o.focus[2], o.zoom ?? 2.5); window.__step(1); }
    // Textures that load asynchronously (the era emblems) get a turn of the event loop.
    await new Promise((r) => setTimeout(r, 50));
    const out = [];
    for (let i = 0; i < (o.frames ? o.before ?? 0 : 0); i++) out.push(grab());
    apply(o.patch);
    if (o.event) R.handleEvents([].concat(o.event), S);
    if (o.frames) for (let i = 0; i < o.frames; i++) out.push(grab());
    else { window.__step(Math.max(0, (o.settle ?? 30) - 1)); out.push(grab()); }
    const report = o.report ? (0, eval)(o.report) : undefined;
    return { out, report };
  }, o);
  await page.close();
  return { images: images.out.map((d) => Buffer.from(d.split(',')[1], 'base64')), errors, report: images.report };
}

function parse(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const [k, inline] = argv[i].slice(2).split(/=(.*)/s);
    const next = argv[i + 1];
    if (inline !== undefined) a[k] = inline;
    else if (next === undefined || next.startsWith('--')) a[k] = true;
    else { a[k] = next; i++; }
  }
  const num = (v) => (v == null ? undefined : Number(v));
  const list = (v) => (v == null ? undefined : String(v).split(',').map(Number));
  const json = (v) => (v == null ? undefined : JSON.parse(v));
  return {
    out: a.out, mock: a.mock, seed: num(a.seed), week: num(a.week), size: a.size, quality: a.quality, time: num(a.time),
    patch: json(a.patch), pre: json(a.pre), event: json(a.event), focus: list(a.focus), zoom: num(a.zoom),
    frames: num(a.frames), before: num(a.before), warm: num(a.warm), settle: num(a.settle), crop: list(a.crop),
    paused: !!a.paused, gpu: !a.software, timeout: num(a.timeout) ?? 300, report: a.report,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parse(process.argv.slice(2));
  if (!o.out) { console.error('scene: --out is required'); process.exit(2); }
  const kill = setTimeout(() => { console.error(`scene: timed out after ${o.timeout} s`); process.exit(124); }, o.timeout * 1000);
  const H = await startHarness({ gpu: o.gpu });
  try {
    const { images, errors, report } = await renderScene(H, o);
    if (report !== undefined) console.log(`scene: report ${JSON.stringify(report)}`);
    const out = resolve(o.out);
    mkdirSync(dirname(out), { recursive: true });
    if (!o.frames) writeFileSync(out, images[0]);
    else {
      const dir = out.replace(/\.[a-z0-9]+$/i, '') + '-frames';
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      images.forEach((b, i) => writeFileSync(`${dir}/${String(i).padStart(4, '0')}.png`, b));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%04d.png`, '-frames:v', String(images.length),
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out.replace(/\.[a-z0-9]+$/i, '') + '.mp4'], { stdio: 'inherit', timeout: 120000 });
      if (r.status !== 0) console.error('scene: ffmpeg failed');
    }
    console.log(`scene: ${o.frames ? `${images.length} frames` : 'still'} -> ${o.out} (${H.renderer})`);
    if (errors.length) { console.error('scene: page errors:', errors.slice(0, 3)); process.exitCode = 1; }
  } finally {
    await H.close();
    clearTimeout(kill);
  }
}
