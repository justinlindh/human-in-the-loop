// One scene, one state change, stills or a clip: the shared helper for review stills and clips.
//
//   node blender/checks/scene.mjs --out shots/x.png [options]
//
//   --mock floor | --seed N [--week W]   the mock sim (default floor) or a real seeded game
//   --moment '<find query>' | --snapshot <path>   an indexed moment (scripts/events/find.js), loaded
//                                        from its snapshot: the state just before it
//   --patch '<json>'                     applied to the state after warm-up (see applyPatch)
//   --pre '<json>'                       applied before warm-up (the "before" state)
//   --patch-js '<js>'                    statements run with S (the state) and R (the renderer) at patch time
//   --event '<json>'                     an event or list of events handed to the renderer with --patch
//   --focus x,y,z [--zoom Z]             ease the camera onto a world point
//   --frames N                           a clip of N frames (30 fps) after the patch; else one still
//   --before N                           clip frames captured before the patch (default 0)
//   --warm N                             frames stepped before anything is captured (default 60)
//   --settle N                           still mode: frames stepped after the patch (default 30)
//   --crop x,y,w,h                       crop every image (canvas pixels)
//   --focus-on '<js>' [--zoom Z]          like --focus, on a point from an expression after the patch
//   --crop-around '<js>' --crop-size WxH  crop every image to WxH around a world point: the
//                                        expression gives [x, y, z], evaluated after the patch
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
import { resolveTarget, openAt } from '../../scripts/events/load.js';
import { writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function renderScene(H, o) {
  const [w, h] = (o.size ?? '960x600').split('x').map(Number);
  const q = new URLSearchParams({ quality: o.quality ?? 'medium' });
  if (o.seed != null) { q.set('seed', String(o.seed)); if (o.week) q.set('weeks', String(o.week)); } else q.set('mock', o.mock ?? 'floor');
  // An indexed moment (scripts/events): the page loads its snapshot instead of a mock or a seed.
  const target = o.snapshot || o.moment ? resolveTarget({ snapshot: o.snapshot, event: o.moment }) : null;
  const { page, errors } = target ? await openAt(H, target, { width: w, height: h, quality: o.quality ?? 'medium' }) : await H.openScene(q.toString(), { width: w, height: h, time: o.time ?? 0.45 });
  const images = await page.evaluate(async (o) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    R.perks.hold = true;
    // three, for expressions (--focus-on, --crop-around, --report) that measure objects.
    window.THREE ??= R.THREE ?? null;
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
    let around = null;
    const grab = () => {
      window.__step(1);
      const c = document.querySelector('canvas');
      let crop = o.crop;
      if (around) {
        // The point on screen, in canvas pixels, with the crop kept inside the canvas.
        const v = new R.camera.position.constructor(...around).project(R.camera);
        const [cw, ch] = o.cropSize;
        const px = ((v.x + 1) / 2) * c.width, py = ((1 - v.y) / 2) * c.height;
        crop = [Math.max(0, Math.min(c.width - cw, Math.round(px - cw / 2))), Math.max(0, Math.min(c.height - ch, Math.round(py - ch / 2))), cw, ch];
      }
      if (!crop) return c.toDataURL('image/png');
      const [x, y, cw, ch] = crop;
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
    // A literal point crops the frames before the patch too, so a clip holds one framing.
    if (o.cropAround?.trim().startsWith('[')) around = JSON.parse(o.cropAround);
    for (let i = 0; i < (o.frames ? o.before ?? 0 : 0); i++) out.push(grab());
    apply(o.patch);
    if (o.patchJs) new Function('S', 'R', o.patchJs)(S, R);
    if (o.event) R.handleEvents([].concat(o.event), S);
    if (o.focusOn) { window.__step(3); const f = (0, eval)(o.focusOn); R.focusAt(f[0], f[2], o.zoom ?? 2.5); window.__step(1); }
    if (o.cropAround) { window.__step(3); around = (0, eval)(o.cropAround); }
    if (!o.frames) { window.__step(Math.max(0, (o.settle ?? 30) - 1)); out.push(grab()); }
    // Clip frames are fetched in batches (below): one call returning every frame can pass the
    // browser's string size limit.
    window.__sceneGrab = grab;
    return { out };
  }, o);
  const frames = [...images.out];
  for (let left = o.frames ?? 0; left > 0; left -= 30) {
    frames.push(...await page.evaluate((n) => Array.from({ length: n }, () => window.__sceneGrab()), Math.min(30, left)));
  }
  const report = o.report ? await page.evaluate((r) => (0, eval)(r), o.report) : undefined;
  await page.close();
  return { images: frames.map((d) => Buffer.from(d.split(',')[1], 'base64')), errors, report };
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
    snapshot: a.snapshot, moment: a.moment, patch: json(a.patch), pre: json(a.pre), event: json(a.event), focus: list(a.focus), zoom: num(a.zoom),
    frames: num(a.frames), before: num(a.before), warm: num(a.warm), settle: num(a.settle), crop: list(a.crop),
    paused: !!a.paused, gpu: !a.software, timeout: num(a.timeout) ?? 300, report: a.report, patchJs: a['patch-js'], cropAround: a['crop-around'], focusOn: a['focus-on'], cropSize: a['crop-size'] ? String(a['crop-size']).split('x').map(Number) : [800, 500],
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
    if (o.frames) rmSync(out.replace(/\.[a-z0-9]+$/i, '') + '.mp4', { force: true });
    if (!o.frames) writeFileSync(out, images[0]);
    else {
      const dir = out.replace(/\.[a-z0-9]+$/i, '') + '-frames';
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      images.forEach((b, i) => writeFileSync(`${dir}/${String(i).padStart(4, '0')}.png`, b));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%04d.png`, '-frames:v', String(images.length),
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', out.replace(/\.[a-z0-9]+$/i, '') + '.mp4'], { stdio: 'inherit', timeout: 120000 });
      if (r.status !== 0) { console.error(`scene: ffmpeg failed${r.error ? `: ${r.error.message}` : ''}`); process.exitCode = 1; }
    }
    // Whatever went wrong on the way, a caller must not see success without the file.
    const written = o.frames ? out.replace(/\.[a-z0-9]+$/i, '') + '.mp4' : out;
    if (!existsSync(written) || statSync(written).size === 0) { console.error(`scene: ${written} was not written`); process.exitCode = 1; }
    if (!process.exitCode) console.log(`scene: ${o.frames ? `${images.length} frames` : 'still'} -> ${o.out} (${H.renderer})`);
    if (errors.length) { console.error('scene: page errors:', errors.slice(0, 3)); process.exitCode = 1; }
  } finally {
    await H.close();
    clearTimeout(kill);
  }
}
