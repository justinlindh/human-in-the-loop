// Scene dump: exact positions, poses and screen boxes of every character, item and staged prop,
// frame by frame, with annotated screenshots. Read positions from here instead of estimating them
// from images.
//
//   node blender/checks/dump.mjs --out <dir> [--mock floor | --seed N [--week W] [--bot balanced|none]]
//        [--snapshot <path> | --moment '<find query>'] [--patch-js '<js>'] [--event '<json>'] [--warm 60]
//        [--frames 0,30,60 | --clip <seconds> [--every 15]] [--size 1280x800] [--quality medium]
//        [--views 0,1,2,3]
//
//   --bot        who plays a seeded game to --week (default balanced; none only ticks the weeks)
//   --patch-js   statements run with S (state) and R (renderer) after the warm-up, before frame 0
//   --snapshot   start from an indexed moment's snapshot (scripts/events/find.js prints paths)
//   --moment     start from the first indexed moment matching a find query, e.g. 'printer_jam --choice 0'
//   --event      an event or list of events handed to the renderer with the patch
//   --frames     frames (at 30 fps, counted from the patch) to dump; default 0
//   --views      camera turns to measure each person's and prop's visibility from (0 is the view as
//                it is, n is n presses of E); without it, only the current view
//   --clip       dump every --every frames (default 15) for this many seconds
//
// Writes <dir>/dump.json ({ scene, frames: [{ frame, t, people, items, props, camera }] }), and for
// each frame <dir>/NNNN.png (the frame as the player sees it, labels included) and
// <dir>/NNNN-annotated.png (ids, boxes, facing arrows, gaze rays, hands). Query it with
// dump-query.mjs. Units and fields are described in dump.js. Renders on the GPU (--software for
// SwiftShader), under the render lock the harness takes.
import { startHarness, wantGpu } from './harness.mjs';
import { resolveTarget, openAt } from '../../scripts/events/load.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const out = opt('out');
if (!out) { console.error('dump: --out is required'); process.exit(2); }
const [w, h] = opt('size', '1280x800').split('x').map(Number);
const warm = Number(opt('warm', 60));
const every = Number(opt('every', 15));
const frames = opt('clip') ? Array.from({ length: Math.floor((Number(opt('clip')) * 30) / every) + 1 }, (_, i) => i * every) : opt('frames', '0').split(',').map(Number).sort((a, b) => a - b);
const q = new URLSearchParams({ quality: opt('quality', 'medium') });
// A seeded game is played to --week by a bot (as the sweep does), so the office is furnished and
// staffed; --bot none only ticks the weeks, choosing the first option of every decision.
const bot = opt('bot', 'balanced');
const week = Number(opt('week', 0));
if (opt('seed')) { q.set('seed', opt('seed')); if (bot === 'none' && week) q.set('weeks', String(week)); } else q.set('mock', opt('mock', 'floor'));
const timeout = Number(opt('timeout', 600));

const kill = setTimeout(() => { console.error(`dump: timed out after ${timeout} s`); process.exit(124); }, timeout * 1000);
const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const H = await startHarness({ gpu: wantGpu() });
try {
  // An indexed moment (scripts/events): the page loads its snapshot, the state just before it.
  const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
  const { page, errors, row } = target ? await openAt(H, target, { width: w, height: h, quality: opt('quality', 'medium') }) : { ...(await H.openScene(q.toString(), { width: w, height: h })), row: null };
  if (target) console.log(`dump: ${row ? `${row.id} seed ${row.seed} bot ${row.bot} week ${row.week}` : 'snapshot'} from ${target.file}`);
  await page.evaluate(async (o) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    window.__dump = await import('/blender/checks/dump.js');
    await window.__dump.prepare();
    if (o.bot && !o.loaded) {
      const { botDecide, botTurn } = await import('/src/sim/bots.js');
      const H = window.__HITL, route = (e) => { if (e?.length) H.emit(e); };
      while (H.state.week < o.week && !H.state.gameOver) {
        botDecide(o.bot, H.state, { onEvents: route });
        botTurn(o.bot, H.state, { onEvents: route });
        H.tickN(1);
        R.sync(H.state);
      }
    }
    window.__step(o.warm);
    if (o.patchJs) new Function('S', 'R', o.patchJs)(S, R);
    if (o.events) R.handleEvents([].concat(o.events), S);
  }, { warm, patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, bot: opt('seed') && bot !== 'none' ? bot : null, week, loaded: !!target });
  const canvas = await page.$('canvas');
  const dumped = [];
  let at = 0;
  for (const f of frames) {
    const shot = await page.evaluate(({ n, views }) => {
      const o = { views };
      window.__step(n);
      const R = window.__hitlRender, S = window.__HITL.state;
      const d = window.__dump.dumpFrame(R, S, { views: o.views });
      return { d, annotated: window.__dump.annotate(R, d) };
    }, { n: f - at, views: opt('views') ? opt('views').split(',').map(Number) : null });
    at = f;
    const name = String(f).padStart(4, '0');
    await canvas.screenshot({ path: `${dir}/${name}.png` });
    writeFileSync(`${dir}/${name}-annotated.png`, Buffer.from(shot.annotated.split(',')[1], 'base64'));
    dumped.push({ frame: f, t: +(f / 30).toFixed(3), ...shot.d });
  }
  writeFileSync(`${dir}/dump.json`, JSON.stringify({ scene: target ? { snapshot: target.file, row } : Object.fromEntries(q), warm, frames: dumped }, null, 1));
  const last = dumped[dumped.length - 1];
  console.log(`dump: ${dumped.length} frame(s), ${last.people.length} people, ${last.items.length} items, ${last.props.length} props -> ${out}/dump.json (${H.renderer})`);
  if (errors.length) { console.error(`dump: page errors: ${errors.slice(0, 3).join('; ')}`); process.exitCode = 1; }
} finally {
  await H.close();
  clearTimeout(kill);
}
