// What's on screen, without video: for a staged scene, per sampled frame, whether the title screen
// is up, the clock (week, speed, paused or frozen, a spotlight holding it), the pending decision,
// every visible UI panel with its text and screen rectangle, the camera, and the staged props and
// people on screen with their screen boxes. For checking a shot or a moment's setup in a second or
// two before recording it.
//
//   node blender/checks/onscreen.mjs [--mock floor | --moment '<query>' | --snapshot <path>]
//        [--patch-js '<js>'] [--event '<json>'] [--warm 30] [--frames 0,30,90] [--json <file>]
//        [--speed 1] [--size 1280x800] [--no-panels]
//
// Frames after the warm-up run the game's own frame (sim clock, UI, renderer) from the harness's
// queued animation frames, with drawing switched off, so a run costs the page load and little else.
// Panels are the visible, named (id or class) elements other than buttons, up to three levels under
// the UI root (#ui), at least 24x12 px and smaller than most of the window, each with its first line
// of text, read with CSS transitions finished. Rectangles are pixels: [left, top, width, height].
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startHarness } from './harness.mjs';
import { resolveTarget, openAt } from '../../scripts/events/load.js';
import { PANELS_INSTALL } from './panels.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [W, H_PX] = String(opt('size', '1280x800')).split('x').map(Number);
const frames = String(opt('frames', '0')).split(',').map(Number).sort((a, b) => a - b);
const t0 = performance.now();
const noPanels = argv.includes('--no-panels');
if (noPanels && opt('speed') != null) { console.error('onscreen: --speed needs the game loop, which --no-panels leaves out'); process.exit(2); }
const args = { warm: Number(opt('warm', 30)), patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, speed: opt('speed') == null ? null : Number(opt('speed')), frames };
const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
let code = 0, shots, errors = [];
if (noPanels) {
  // The studio engine: the scene stepped by the renderer alone (no UI, no game loop), through the same page code.
  const { runCases } = await import('../../scripts/studio/page-host.mjs');
  const [r] = await runCases([{ page: { ...(target ? { snapshot: target.file } : { mock: opt('mock', 'floor') }), quality: 'medium', width: W, height: H_PX }, module: fileURLToPath(new URL('./onscreen-page.js', import.meta.url)), fn: 'onscreenShots', arg: { ...args, engine: true, loaded: !!target } }], { jobs: 1 });
  if (r.error) { console.error(`onscreen: engine: ${r.error}`); process.exit(1); }
  shots = r.value;
} else {
  const H = await startHarness();
  try {
    const opened = target ? await openAt(H, target, { width: W, height: H_PX, quality: 'medium' }) : await H.openScene(`quality=medium&mock=${opt('mock', 'floor')}`, { width: W, height: H_PX });
    errors = opened.errors;
    await opened.page.evaluate(PANELS_INSTALL);
    shots = await opened.page.evaluate(async (o) => (await import('/blender/checks/onscreen-page.js')).onscreenShots(o), args);
  } finally {
    await H.close();
  }
}
{
  for (const s of shots) {
    const c = s.clock;
    console.log(`ONSCREEN frame ${s.frame}: ${s.title ? 'TITLE SCREEN UP, ' : ''}week ${c.week}, speed ${c.speed ?? '-'}${c.paused ? ', paused' : ''}${c.frozen ? ', frozen' : ''}${c.spotlight ? `, spotlight ${c.spotlight}` : ''}; decision ${s.decision ? `${s.decision.eventId}${s.decision.stage ? ` (${s.decision.stage})` : ''}` : 'none'}; camera yaw ${s.camera.yawDeg} deg, zoom ${s.camera.zoom}`);
    for (const p of s.panels) console.log(`  panel ${p.el} [${p.rect.join(', ')}]${p.text ? ` "${p.text}"` : ''}`);
    for (const p of s.props) console.log(`  prop ${p.prop} [${p.rect.join(', ')}]`);
    console.log(`  people on screen: ${s.people.length} (${s.people.map((p) => p.id).join(', ')})`);
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(shots, null, 1));
  if (errors.length) { code = 1; console.log(`onscreen: page errors: ${errors.slice(0, 3).join('; ')}`); }
  console.log(`onscreen: ${shots.length} frame(s) in ${(performance.now() - t0).toFixed(0)} ms${noPanels ? ' (studio engine, no panels)' : ''}`);
}
process.exit(code);
