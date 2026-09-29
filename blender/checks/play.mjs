// The snapshot player: plays a saved state forward through the game's real loop and writes a clip
// and a per-frame log, so a candidate moment can be judged (or rejected) without hand-writing a loop.
//
//   node blender/checks/play.mjs --snapshot <path> | --moment '<find query>'
//        [--focus rack|hub|s3|staff:s3|item:<placed id or item id>|pos:x,z|js:<expr>] [--zoom 2]
//        [--weeks 12] [--max-seconds 120] [--until '<js over S>'] [--tail 3]
//        [--choose 'event_id=1,other=0'] [--default-choice 0] [--decision-hold 2]
//        [--out clip.mp4] [--log log.json] [--log-js '<js over S, R>'] [--every 1]
//        [--focus-yield] [--keep-frames] [--size 1280x720] [--software] [--timeout 600]
//
// The snapshot loads through the title screen's Continue path and the game's own loop runs on
// virtual time (loop-page.mjs), so decision freezes, spotlights and the UI behave as for a player.
// Each frame: decisions are answered (--choose per event id, else --default-choice, after
// --decision-hold seconds so the card shows), "Got it" cards are dismissed, and the camera follows
// --focus (a staff id follows that person, at --zoom; `hub` is the outage rack, else the first responder).
// It stops when --until (a predicate over the state S) has held and --tail seconds have passed, or
// after --weeks weeks or --max-seconds of game time.
//
// Output: --out is an mp4 (every --every-th frame is recorded, 30 fps; the frames in <out>-frames/ are
// removed unless --keep-frames).
// --log is JSON, one row per frame: week, clock, decision, outage, camera, the focus's screen box,
// the people on screen with their boxes, and anything --log-js returns (an object merged in). Boxes
// are pixels [left, top, width, height] on the canvas, as onscreen.mjs reports them.
// Exit codes: 0 done (and --until held, if given); 1 --until never held; 2 could not run.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';
import { resolveTarget } from '../../scripts/events/load.js';
import { openLoopPage } from './loop-page.mjs';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const fail = (msg) => { console.error(`play: ${msg}`); process.exit(2); };
const [W, H_PX] = String(opt('size', '1280x720')).split('x').map(Number);
const maxFrames = Math.round(Number(opt('max-seconds', 120)) * 30);
const maxWeeks = Number(opt('weeks', 12));
const tail = Math.round(Number(opt('tail', 3)) * 30);
const hold = Math.round(Number(opt('decision-hold', 2)) * 30);
const every = Math.max(1, Number(opt('every', 1)));
const choices = Object.fromEntries(String(opt('choose', '')).split(',').filter(Boolean).map((p) => p.split('=')));
const defaultChoice = Number(opt('default-choice', 0));
const until = opt('until');
const out = opt('out') ? resolve(opt('out')) : null;
for (const [k, args] of [['until', ['S']], ['log-js', ['S', 'R']]]) if (opt(k)) { try { new Function(...args, `return (${opt(k)});`); } catch (e) { fail(`--${k} is not a JS expression: ${e.message}`); } }

let file = opt('snapshot');
if (!file) {
  if (!opt('moment')) fail('give --snapshot <path> or --moment <find query>');
  try { file = resolveTarget({ event: `${opt('moment')} --pre` }).file; } catch (e) { fail(e.message); }
}
if (!existsSync(file)) fail(`no snapshot at ${file}`);

holdRenderLock(glMode({ argv }));
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const { browser } = await launchChromium(chromium, { mode: glMode({ argv }), label: 'play' });
let code = 0;
try {
  const { page, errors } = await openLoopPage(browser, server.resolvedUrls.local[0], file, { width: W, height: H_PX });
  const started = await page.evaluate(({ focus, zoom }) => {
    const H = window.__HITL, R = window.__hitlRender;
    const r = H.controls.continueGame();
    if (!r.ok) return { error: `continueGame: ${JSON.stringify(r)}` };
    H.setSpeed?.(1);
    window.__play = { focus, zoom };
    return { week: H.state.week };
  }, { focus: opt('focus') ?? null, zoom: Number(opt('zoom', 2)) });
  if (started.error) fail(started.error);
  if (out) { rmSync(`${out}-frames`, { recursive: true, force: true }); mkdirSync(`${out}-frames`, { recursive: true }); }

  const log = [];
  let recorded = 0, untilAt = null, frame = 0, decisionFor = 0, reason = 'max-seconds';
  const startWeek = started.week;
  for (; frame < maxFrames; frame++) {
    const row = await page.evaluate(({ frame, choices, defaultChoice, hold, decisionFor, until, logJs, recording, yieldFocus }) => {
      const H = window.__HITL, R = window.__hitlRender, S = H.state, THREE = R.THREE;
      window.__frame(1);
      // The camera: a staff id follows that person; other targets are a point eased onto now and then.
      const spec = window.__play.focus, zoom = window.__play.zoom;
      const staffPos = (id) => { let p = null; R.scene.traverse((o) => { if (o.userData.staffId === id) p = o.parent.getWorldPosition(new THREE.Vector3()); }); return p; };
      const point = () => {
        const responders = S.outage?.responderIds ?? [];
        if (!spec) return null;
        if (/^(staff:)?s\d+$/.test(spec)) { const id = spec.replace('staff:', ''); const p = staffPos(id); return { staff: id, p }; }
        if (spec === 'rack') { const q = R.office.current?.dyn.racks[0]?.position; return q ? { p: q } : null; }
        if (spec === 'hub') {
          const q = R.office.current?.dyn.racks[0]?.position;
          if (q && S.outage) return { p: q };
          return responders[0] ? { staff: responders[0], p: staffPos(responders[0]) } : null;
        }
        if (spec.startsWith('item:')) { const id = spec.slice(5); const e = R.office.placed.get(id) ?? [...R.office.placed.values()].find((x) => x.itemId === id); return e?.target ? { p: e.target } : null; }
        if (spec.startsWith('pos:')) { const [x, z] = spec.slice(4).split(',').map(Number); return { p: { x, z } }; }
        if (spec.startsWith('js:')) { const v = new Function('S', 'R', `return (${spec.slice(3)});`)(S, R); return typeof v === 'string' ? { staff: v, p: staffPos(v) } : v ? { p: { x: v[0], z: v[1] } } : null; }
        return null;
      };
      const target = point();
      // The first frame cuts onto the target; after that the camera eases (R.easeTo), following a
      // staff member or a moving point, and steps aside while a spotlight moment plays (--focus-yield).
      if (target?.p && (frame === 0 || (frame % 5 === 0 && !(yieldFocus && R.spotlight?.())))) {
        if (frame === 0) R.focusAt(target.p.x, target.p.z, zoom); else R.easeTo(target.p.x, target.p.z, zoom);
      }
      // Decisions: the card shows for `hold` frames, then the chosen option is taken.
      let answered = null, held = decisionFor;
      if (S.pendingDecision) {
        held++;
        if (held >= hold) { const id = S.pendingDecision.eventId; const c = Number(choices[id] ?? defaultChoice); H.dispatch({ type: 'resolveDecision', choice: c }); answered = { id, choice: c }; held = 0; }
      } else held = 0;
      const canvas = document.querySelector('canvas'), cr = canvas.getBoundingClientRect();
      const box = (v3) => { const p = v3.clone().project(R.camera); return [Math.round(((p.x + 1) / 2) * cr.width), Math.round(((1 - p.y) / 2) * cr.height)]; };
      const boxOf = (obj) => {
        const b = new THREE.Box3().setFromObject(obj);
        if (b.isEmpty()) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < 8; i++) { const [x, y] = box(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z)); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        return x1 > 0 && y1 > 0 && x0 < cr.width && y0 < cr.height ? [x0, y0, x1 - x0, y1 - y0] : null;
      };
      let people = null;
      if (recording) {
        people = [];
        R.scene.traverse((c) => { if (c.name === 'character' && c.visible) { let id = null; c.traverse((x) => { if (x.userData.staffId !== undefined) id = x.userData.staffId; }); const b = boxOf(c); if (b) people.push({ id: id ?? 'extra', rect: b.map(Math.round) }); } });
      }
      const at = target?.p ? (() => { const v = new THREE.Vector3(target.p.x, target.p.y ?? 0.4, target.p.z); const [x, y] = box(v); return [x, y]; })() : null;
      const clock = H.clock;
      const o = S.outage;
      let extra = {};
      if (logJs) { try { extra = new Function('S', 'R', `return (${logJs});`)(S, R) ?? {}; } catch (e) { extra = { logJsError: e.message }; } }
      let stop = false;
      if (until) { try { stop = !!new Function('S', `return (${until});`)(S); } catch { stop = false; } }
      return {
        row: {
          f: frame, week: S.week, decision: S.pendingDecision?.eventId ?? null, answered,
          outage: o ? { kind: o.kind, weeks: o.weeks, eta: o.etaWeeks ?? null, responders: o.responderIds ?? [] } : null,
          clock: { frozen: clock.frozen ?? null, spotlight: clock.spotlight ? `${clock.spotlight.kind ?? ''} ${clock.spotlight.key ?? ''}`.trim() : null, busy: clock.busy ?? null },
          camera: { zoom: +R.view().zoom.toFixed(2) }, focus: at, people, ...extra,
        },
        held, stop, busy: !!clock.busy && !S.pendingDecision, gameOver: !!S.gameOver,
      };
    }, { frame, choices, defaultChoice, hold, decisionFor, until, logJs: opt('log-js') ?? null, recording: !!opt('log'), yieldFocus: argv.includes('--focus-yield') });
    decisionFor = row.held;
    log.push(row.row);
    // A "Got it" card (a toast card the UI holds the game on) is dismissed like a player would.
    if (row.busy) await page.locator('button', { hasText: 'Got it' }).first().click({ timeout: 500 }).catch(() => {});
    if (out && frame % every === 0) { await page.screenshot({ path: `${out}-frames/${String(recorded++).padStart(5, '0')}.png` }); }
    if (row.stop && untilAt === null) untilAt = frame;
    if (untilAt !== null && frame - untilAt >= tail) { reason = 'until'; break; }
    if (row.gameOver) { reason = 'game over'; break; }
    if (row.row.week - startWeek >= maxWeeks && untilAt === null) { reason = 'weeks'; break; }
  }
  if (out && recorded) {
    mkdirSync(dirname(out), { recursive: true });
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(30 / every), '-i', `${out}-frames/%05d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', out], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(`play: ffmpeg failed: ${r.stderr}`); code = 2; }
    else if (!argv.includes('--keep-frames')) rmSync(`${out}-frames`, { recursive: true, force: true });
  }
  if (opt('log')) writeFileSync(opt('log'), JSON.stringify(log, null, 1));
  const last = log[log.length - 1];
  const answered = log.filter((r) => r.answered).map((r) => `${r.answered.id}=${r.answered.choice}`);
  console.log(`PLAY ${reason}: ${frame + 1} frames (${((frame + 1) / 30).toFixed(1)} s), week ${startWeek} to ${last.week}${answered.length ? `, decisions ${answered.join(', ')}` : ''}${until ? `, --until ${untilAt === null ? 'never held' : `held at frame ${untilAt}`}` : ''}${out ? `, ${recorded} frames -> ${out}` : ''}`);
  if (until && untilAt === null && code === 0) code = 1;
  if (errors.length) { console.error(`play: page errors: ${errors.slice(0, 3).join('; ')}`); code = code || 2; }
} finally {
  await browser.close().catch(() => {});
  await server.close();
}
process.exit(code);
