// What's on screen, without video: for a staged scene, per sampled frame, whether the title screen
// is up, the clock (week, speed, paused or frozen, a spotlight holding it), the pending decision,
// every visible UI panel with its text and screen rectangle, the camera, and the staged props and
// people on screen with their screen boxes. For checking a shot or a moment's setup in a second or
// two before recording it.
//
//   node blender/checks/onscreen.mjs [--mock floor | --moment '<query>' | --snapshot <path>]
//        [--patch-js '<js>'] [--event '<json>'] [--warm 30] [--frames 0,30,90] [--json <file>]
//        [--speed 1] [--size 1280x800]
//
// Frames after the warm-up run the game's own frame (sim clock, UI, renderer) from the harness's
// queued animation frames, with drawing switched off, so a run costs the page load and little else.
// Panels are the visible, named (id or class) elements other than buttons, up to three levels under
// the UI root (#ui), at least 24x12 px and smaller than most of the window, each with its first line
// of text, read with CSS transitions finished. Rectangles are pixels: [left, top, width, height].
import { writeFileSync } from 'node:fs';
import { startHarness } from './harness.mjs';
import { resolveTarget, openAt } from '../../scripts/events/load.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [W, H_PX] = String(opt('size', '1280x800')).split('x').map(Number);
const frames = String(opt('frames', '0')).split(',').map(Number).sort((a, b) => a - b);
const t0 = performance.now();
const H = await startHarness();
let code = 0;
try {
  const target = opt('snapshot') || opt('moment') ? resolveTarget({ snapshot: opt('snapshot'), event: opt('moment') }) : null;
  const { page, errors } = target ? await openAt(H, target, { width: W, height: H_PX, quality: 'medium' }) : await H.openScene(`quality=medium&mock=${opt('mock', 'floor')}`, { width: W, height: H_PX });
  const shots = await page.evaluate(async (o) => {
    const R = window.__hitlRender, G = window.__HITL, THREE = R.THREE;
    window.__settle(o.warm);
    if (o.patchJs) new Function('S', 'R', o.patchJs)(G.state, R);
    if (o.events) R.handleEvents([].concat(o.events), G.state);
    const canvas = document.querySelector('canvas');
    const cr = canvas.getBoundingClientRect();
    const toCanvas = (v) => { const p = v.clone().project(R.camera); return { x: ((p.x + 1) / 2) * cr.width, y: ((1 - p.y) / 2) * cr.height, z: p.z }; };
    const boxOf = (obj) => {
      const b = new THREE.Box3().setFromObject(obj);
      if (b.isEmpty()) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const s = toCanvas(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
      }
      const on = x1 > 0 && y1 > 0 && x0 < cr.width && y0 < cr.height;
      return { on, rect: [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v)) };
    };
    const shown = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const panels = () => {
      const root = document.getElementById('ui');
      // CSS transitions run on wall time, not the harness clock: read each panel as it settles.
      for (const a of document.getAnimations()) { try { a.finish(); } catch { /* an endless animation stays */ } }
      const out = [];
      const visit = (el, depth) => {
        for (const c of el.children) {
          if (!shown(c) || c.tagName === "BUTTON" || /\bspacer\b/.test(c.className)) continue;
          const r = c.getBoundingClientRect();
          const named = c.id || (typeof c.className === 'string' && c.className.trim());
          const whole = r.width * r.height > 0.8 * innerWidth * innerHeight;
          if (named && !whole && r.width >= 24 && r.height >= 12 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) {
            out.push({ el: c.id ? `#${c.id}` : `.${c.className.trim().split(/\s+/).join('.')}`, text: (c.innerText || '').trim().split('\n')[0].slice(0, 70), rect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v)) });
          }
          if (depth < 2) visit(c, depth + 1);
        }
      };
      if (root) visit(root, 0);
      return out;
    };
    if (o.speed != null) G.setSpeed(o.speed);
    const render = R.render;
    const play = (n) => {
      R.render = (dt, opt) => render.call(R, dt, { ...opt, draw: false });
      try {
        for (let i = 0; i < n; i++) { window.__tick(1000 / 30); for (const cb of window.__rafQ.splice(0)) cb(performance.now()); }
      } finally { R.render = render; }
    };
    const out = [];
    let at = 0;
    for (const f of o.frames) {
      play(Math.max(0, f - at)); at = f;
      const S = G.state, clock = G.clock ?? {};
      const dir = R.camera.getWorldDirection(new THREE.Vector3());
      const props = (R.props?.current() ?? []).map((p) => ({ prop: p.prop, ...boxOf(p.obj) })).filter((p) => p.on);
      const people = [];
      R.scene.traverse((c) => { if (c.name === 'character' && c.visible) { let id = null; c.traverse((x) => { if (x.userData.staffId !== undefined) id = x.userData.staffId; }); const b = boxOf(c); if (b?.on) people.push({ id: id ?? 'extra', rect: b.rect }); } });
      const sp = R.spotlight?.();
      out.push({
        frame: f,
        title: !!document.querySelector('#ui .title-mode'), clock: { week: S.week, speed: clock.speed ?? null, paused: !!R.paused || clock.speed === 0, frozen: clock.frozen ?? null, spotlight: sp ? `${sp.kind}${sp.key ? ` ${sp.key}` : ''}` : null },
        decision: S.pendingDecision ? { eventId: S.pendingDecision.eventId, subjectId: S.pendingDecision.subjectId ?? null, stage: S.pendingDecision.stage ? `${S.pendingDecision.stage.prop} at ${S.pendingDecision.stage.anchor}${S.pendingDecision.stage.staffId ? ` (${S.pendingDecision.stage.staffId})` : ''}` : null } : null,
        panels: panels(),
        camera: { pos: R.camera.position.toArray().map((v) => +v.toFixed(2)), yawDeg: Math.round((Math.atan2(-dir.x, -dir.z) * 180) / Math.PI), zoom: +R.camera.zoom.toFixed(2) },
        props, people,
      });
    }
    return out;
  }, { warm: Number(opt('warm', 30)), patchJs: opt('patch-js'), events: opt('event') ? JSON.parse(opt('event')) : null, speed: opt('speed') == null ? null : Number(opt('speed')), frames });
  for (const s of shots) {
    const c = s.clock;
    console.log(`ONSCREEN frame ${s.frame}: ${s.title ? 'TITLE SCREEN UP, ' : ''}week ${c.week}, speed ${c.speed ?? '-'}${c.paused ? ', paused' : ''}${c.frozen ? ', frozen' : ''}${c.spotlight ? `, spotlight ${c.spotlight}` : ''}; decision ${s.decision ? `${s.decision.eventId}${s.decision.stage ? ` (${s.decision.stage})` : ''}` : 'none'}; camera yaw ${s.camera.yawDeg} deg, zoom ${s.camera.zoom}`);
    for (const p of s.panels) console.log(`  panel ${p.el} [${p.rect.join(', ')}]${p.text ? ` "${p.text}"` : ''}`);
    for (const p of s.props) console.log(`  prop ${p.prop} [${p.rect.join(', ')}]`);
    console.log(`  people on screen: ${s.people.length} (${s.people.map((p) => p.id).join(', ')})`);
  }
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify(shots, null, 1));
  if (errors.length) { code = 1; console.log(`onscreen: page errors: ${errors.slice(0, 3).join('; ')}`); }
  console.log(`onscreen: ${shots.length} frame(s) in ${(performance.now() - t0).toFixed(0)} ms`);
} finally {
  await H.close();
}
process.exit(code);
