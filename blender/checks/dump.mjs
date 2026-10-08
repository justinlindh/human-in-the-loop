// Scene dump: exact positions, poses and screen boxes of every character, item and staged prop,
// frame by frame, with annotated screenshots. Read positions from here instead of estimating them
// from images.
//
//   node blender/checks/dump.mjs --out <dir> [--mock floor | --seed N [--week W] [--bot balanced|none]]
//        [--snapshot <path> | --moment '<find query>'] [--patch-js '<js>'] [--event '<json>'] [--warm 60]
//        [--frames 0,30,60 | --clip <seconds> [--every 15]] [--size 1280x800] [--quality medium] [--trace]
//        [--views 0,1,2,3] [--images | --browser]
//
//   --images     also write the PNGs (the frame, and the annotated one); this needs a browser and a GPU.
//                Without it, dump.json is made on the studio engine (Node, nothing drawn): same fields
//   --browser    make dump.json in the browser without PNGs (to compare with the engine)
//   --bot        who plays a seeded game to --week (default balanced; none only ticks the weeks)
//   --patch-js   statements run with S (state) and R (renderer) after the warm-up, before frame 0
//   --sweep-row  <report.json> <state or violation key> [<person id>]: the scene a sweep window sampled (seed:3:w556), as the
//                window starts, on the engine (or with --browser, in a page as a browser sweep plays it; no --images).
//                Prints the report's rows in that window, and whether the person is there.
//   --snapshot   start from an indexed moment's snapshot (scripts/events/find.js prints paths)
//   --moment     start from the first indexed moment matching a find query, e.g. 'printer_jam --choice 0'
//   --event      an event or list of events handed to the renderer with the patch
//   --frames     frames (at 30 fps, counted from the patch) to dump; default 0
//   --views      camera turns to measure each person's and prop's visibility from (0 is the view as
//                it is, n is n presses of E); without it, only the current view
//   --trace      the moment ownership trace from the start of the warm-up: each frame gets the
//                entries since the one before (who set a person's temp, and every start, end,
//                interrupt, replacement, refusal and decision freeze), and each person's temp names
//                the function that set it
//   --clip       dump every --every frames (default 15) for this many seconds
//
// Writes <dir>/dump.json ({ scene, frames: [{ frame, t, people, items, props, camera }] }), and with
// --images for each frame <dir>/NNNN.png (the frame as the player sees it, labels included) and
// <dir>/NNNN-annotated.png (ids, boxes, facing arrows, gaze rays, hands). Query it with
// dump-query.mjs. Units and fields are described in dump.js. The browser runs render on the GPU
// (--software for SwiftShader), under the render lock the harness takes.
import { spotReasons } from '../../src/render/spots.js';
import { startHarness, wantGpu } from './harness.mjs';
import { resolveTarget, openAt } from '../../scripts/events/load.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SEED_PLAY } from './sweep-plan.js';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const out = opt('out');
if (!out) { console.error('dump: --out is required'); process.exit(2); }
const [w, h] = opt('size', '1280x800').split('x').map(Number);
const warm = Number(opt('warm', 60));
const every = Number(opt('every', 15));
const framesArg = opt('frames', '0');
if (!opt('clip') && !/^\d+(,\d+)*$/.test(framesArg)) { console.error(`dump: --frames wants a comma list of whole frame numbers (like 0,30,60), got "${framesArg}"; use --clip <seconds> --every <n> for a range`); process.exit(2); }
const frames = opt('clip') ? Array.from({ length: Math.floor((Number(opt('clip')) * 30) / every) + 1 }, (_, i) => i * every) : framesArg.split(',').map(Number).sort((a, b) => a - b);
const q = new URLSearchParams({ quality: opt('quality', 'medium') });
// A seeded game is played to --week by a bot (as the sweep does), so the office is furnished and
// staffed; --bot none only ticks the weeks, choosing the first option of every decision.
const bot = opt('bot', 'balanced');
const week = Number(opt('week', 0));
if (opt('seed')) { q.set('seed', opt('seed')); if (bot === 'none' && week) q.set('weeks', String(week)); } else q.set('mock', opt('mock', 'floor'));
const timeout = Number(opt('timeout', 600));

const images = argv.includes('--images');
const useBrowser = images || argv.includes('--browser');

const kill = setTimeout(() => { console.error(`dump: timed out after ${timeout} s`); process.exit(124); }, timeout * 1000);
const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const sweepRow = opt('sweep-row');
if (sweepRow) {
  // The exact scene a sweep window sampled: the report's seed replayed as the sweep plays it (its mode's steps), stopped as
  // the window starts, then dumped like any scene. On the engine by default, or with --browser in a harness page as a
  // browser sweep plays its seeds, to compare the two engines on one window.
  if (images) { console.error('dump: --sweep-row writes no PNGs; drop --images (--browser dumps the window in a browser)'); process.exit(2); }
  const at = argv.indexOf('--sweep-row');
  const [reportFile, key] = [sweepRow, argv[at + 2]];
  const thing = argv[at + 3]?.startsWith('--') ? undefined : argv[at + 3];
  if (!key || key.startsWith('--')) { console.error('dump: --sweep-row wants <report.json> <state or violation key> [<person id>]'); process.exit(2); }
  let report;
  try { report = JSON.parse(readFileSync(resolve(reportFile), 'utf8')); } catch (e) { console.error(`dump: cannot read the report "${reportFile}" (${e.message.split('\n')[0]})`); process.exit(2); }
  // A report from other code can show people elsewhere than this checkout plays them: say so first.
  const { checkoutOf, checkoutMismatch } = await import('./checkout.mjs');
  const mismatch = checkoutMismatch(report, checkoutOf(resolve(import.meta.dirname, '../..')));
  if (mismatch) console.error(`dump: warning: ${mismatch}`);
  const rows = (report.violations ?? []).filter((v) => v.key === key || v.state === key || (v.states ?? []).includes(key));
  const inState = (st) => (report.violations ?? []).filter((v) => v.state === st || (v.states ?? []).includes(st));
  const state = /^seed:\d+:w\d+$/.test(key) ? key : (rows[0]?.states ?? [rows[0]?.state]).find((s) => /^seed:\d+:w\d+$/.test(s ?? ''));
  const m = /^seed:(\d+):w(\d+)$/.exec(state ?? '');
  if (!m) { console.error(`dump: --sweep-row: "${key}" names no seeded window in ${reportFile} (a state like seed:3:w556, or a violation key whose states include one)`); process.exit(2); }
  const play = SEED_PLAY[report.mode ?? 'fast'];
  if (!play) { console.error(`dump: --sweep-row: the report's mode "${report.mode}" is not one this dump knows`); process.exit(2); }
  const here = inState(state);
  const seedOpts = { seed: Number(m[1]), ...play, only: [Number(m[2])], stopAt: Number(m[2]), known: [], worst: {} };
  const dumpOpts = { warm: 0, trace: argv.includes('--trace'), frames, views: opt('views') ? opt('views').split(',').map(Number) : null };
  const notReached = (r) => { console.error(`dump: --sweep-row: seed ${m[1]} played to week ${r.end.week}${r.end.over ? ` (${r.end.over})` : ''} without a window at week ${m[2]}`); process.exit(1); };
  let r, dumped, engineName;
  if (!useBrowser) {
    const host = await import('../../scripts/studio/sweep-host.mjs');
    r = await host.hostSeed(seedOpts);
    if (!r.stopped) notReached(r);
    const { dumpPage } = await import('./dump-page.js');
    dumped = await dumpPage({ ...dumpOpts, width: w, height: h });
    engineName = 'studio engine';
  } else {
    // As sweep.mjs's browser seeds: a low-quality seeded page at the sweep's size, the index's pacing pinned,
    // the sweep's own sampler played to the window; then the frames are dumped in that page.
    const { pinIndexPacing } = await import('../../scripts/events/play.js');
    const HS = await startHarness({ gpu: wantGpu() });
    try {
      const { page, errors } = await HS.openScene(`quality=low&seed=${m[1]}`, { width: 1600, height: 1000 });
      await pinIndexPacing(page);
      r = await page.evaluate(async (o) => (await import('/blender/checks/sample.js')).sampleSeed(o), { ...seedOpts, crops: 0 });
      if (!r.stopped) { await HS.close(); notReached(r); }
      dumped = await page.evaluate(async (o) => (await import('/blender/checks/dump-page.js')).dumpPage(o), dumpOpts);
      if (errors.length) console.error(`dump: page errors: ${errors.slice(0, 3).join('; ')}`);
      engineName = `browser, ${HS.renderer}`;
    } finally { await HS.close(); }
  }
  clearTimeout(kill);
  writeFileSync(`${dir}/dump.json`, JSON.stringify({ scene: { sweepRow: state, report: reportFile, why: r.stopped.why, mode: report.mode ?? 'fast', engine: useBrowser ? 'browser' : 'studio' }, warm: 0, frames: dumped }, null, 1));
  console.log(`dump: ${state} (${r.stopped.why}), the scene as the window starts; the report's rows in it: ${here.length ? `${here.slice(0, 6).map((v) => v.detail).join('; ')}${here.length > 6 ? `; and ${here.length - 6} more` : ''}` : 'none'}`);
  const people = dumped[0].people;
  if (thing) console.log(people.some((p) => p.id === thing) ? `dump: ${thing} is in the scene${(() => { const p = people.find((q) => q.id === thing); return ` at (${p.pos[0].toFixed(2)}, ${p.pos[2].toFixed(2)})`; })()}` : `dump: ${thing} is not in the scene (${people.length} people)`);
  console.log(`dump: ${dumped.length} frame(s), ${people.length} people -> ${out}/dump.json (${engineName})`);
  process.exit(thing && !people.some((p) => p.id === thing) ? 1 : 0);
}
if (!useBrowser) {
  // The studio engine: the game's own scene in Node, stepped by the same page function, nothing drawn.
  const { runCases } = await import('../../scripts/studio/page-host.mjs');
  const { fileURLToPath } = await import('node:url');
  const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
  const seeded = opt('seed') ? { seed: Number(opt('seed')), ...(bot === 'none' && week ? { weeks: week } : {}) } : { mock: opt('mock', 'floor') };
  const page = { ...(target ? { snapshot: target.file } : seeded), quality: opt('quality', 'medium'), width: w, height: h };
  if (target) console.log(`dump: ${target.row ? `${target.row.id} seed ${target.row.seed} bot ${target.row.bot} week ${target.row.week}` : 'snapshot'} from ${target.file}`);
  const [r] = await runCases([{ page, module: fileURLToPath(new URL('./dump-page.js', import.meta.url)), fn: 'dumpPage', arg: { warm, patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, loaded: !!target, bot: opt('seed') && bot !== 'none' ? bot : null, week, trace: argv.includes('--trace'), frames, width: w, height: h, views: opt('views') ? opt('views').split(',').map(Number) : null } }], { jobs: 1 });
  clearTimeout(kill);
  if (r.error) { console.error(`dump: engine: ${r.error}`); process.exit(1); }
  const dumped = r.value;
  writeFileSync(`${dir}/dump.json`, JSON.stringify({ scene: target ? { snapshot: target.file, row: target.row } : Object.fromEntries(q), warm, frames: dumped }, null, 1));
  const last = dumped[dumped.length - 1];
  for (const line of spotReasons(last.spotSearches)) console.log(`spots: ${line}`);
  console.log(`dump: ${dumped.length} frame(s), ${last.people.length} people, ${last.items.length} items, ${last.props.length} props -> ${out}/dump.json (studio engine)`);
  process.exit(0);
}
const H = await startHarness({ gpu: wantGpu() });
try {
  // An indexed moment (scripts/events): the page loads its snapshot, the state just before it.
  const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
  const { page, errors, row } = target ? await openAt(H, target, { width: w, height: h, quality: opt('quality', 'medium') }) : { ...(await H.openScene(q.toString(), { width: w, height: h })), row: null };
  if (target) console.log(`dump: ${row ? `${row.id} seed ${row.seed} bot ${row.bot} week ${row.week}` : 'snapshot'} from ${target.file}`);
  await page.evaluate(async (o) => {
    const R = window.__hitlRender, S = window.__HITL.state;
    if (o.trace && R.trace) R.trace.on = true;
    R.spotTrace = true;
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
  }, { warm, patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, bot: opt('seed') && bot !== 'none' ? bot : null, week, loaded: !!target, trace: argv.includes('--trace') });
  const canvas = await page.$('canvas');
  const dumped = [];
  let at = 0;
  for (const f of frames) {
    const shot = await page.evaluate(({ n, views, img }) => {
      const o = { views, images: img };
      window.__step(n);
      const R = window.__hitlRender, S = window.__HITL.state;
      const d = window.__dump.dumpFrame(R, S, { views: o.views });
      // The trace entries since the last dumped frame.
      if (R.trace?.on) { d.trace = R.trace.lines(600).filter((l) => l.seq > (window.__traceSeen ?? -1)); if (d.trace.length) window.__traceSeen = d.trace[d.trace.length - 1].seq; }
      return { d, annotated: o.images ? window.__dump.annotate(R, d) : null };
    }, { n: f - at, img: images, views: opt('views') ? opt('views').split(',').map(Number) : null });
    at = f;
    const name = String(f).padStart(4, '0');
    if (images) {
      await canvas.screenshot({ path: `${dir}/${name}.png` });
      writeFileSync(`${dir}/${name}-annotated.png`, Buffer.from(shot.annotated.split(',')[1], 'base64'));
    }
    dumped.push({ frame: f, t: +(f / 30).toFixed(3), ...shot.d });
  }
  writeFileSync(`${dir}/dump.json`, JSON.stringify({ scene: target ? { snapshot: target.file, row } : Object.fromEntries(q), warm, frames: dumped }, null, 1));
  const last = dumped[dumped.length - 1];
  for (const line of spotReasons(last.spotSearches)) console.log(`spots: ${line}`);
  console.log(`dump: ${dumped.length} frame(s), ${last.people.length} people, ${last.items.length} items, ${last.props.length} props -> ${out}/dump.json (${H.renderer})`);
  if (errors.length) { console.error(`dump: page errors: ${errors.slice(0, 3).join('; ')}`); process.exitCode = 1; }
} finally {
  await H.close();
  clearTimeout(kill);
}
