// The printer homage animatic on stand-ins: one capture item per shot of shots.json, each a flat field,
// a printer box and three capsule figures seen through the flying camera on that shot's keys (cameras.js).
//
//   scripts/with-render-lock.sh --gpu node scripts/capture.js --manifest scripts/reels/printer-homage/manifest.js --out <dir> [--only homage-03,...]
//   scripts/reels/printer-homage/cut.sh <dir> <out.mp4> [audio]    joins the shots in order at their real timings
import { readFileSync } from 'node:fs';
import { CAMERAS } from './cameras.js';
import { TRACKS } from './standins.js';

const SHOTS = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8')).shots;

// Offsets from a figure's track become absolute keys at the key's cut time.
const at = (key, T) => {
  if (!key.rel) return key;
  const [bx, bz] = key.rel === 'G' ? ['K', 'T', 'S'].map((k) => TRACKS[k](T)).reduce((p, q) => [p[0] + q[0] / 3, p[1] + q[1] / 3], [0, 0]) : TRACKS[key.rel](T);
  const off = (o) => [bx + o[0], o[1], bz + o[2]];
  return { pos: off(key.pos), look: off(key.look), fov: key.fov };
};

const setup = (shot) => `(async () => {
  const st = document.createElement('style'); st.textContent = '#ui { display: none !important; }'; document.head.append(st);
  const R = window.__hitlRender;
  const { build } = await import('/scripts/reels/printer-homage/standins.js');
  const update = build(R.scene);
  const t0 = window.__capture.now;
  const tick = () => { update(${shot.start} + (window.__capture.now - t0) / 1000); requestAnimationFrame(tick); };
  tick();
  const c = ${JSON.stringify({ a: at(CAMERAS[shot.n].a, shot.start), b: at(CAMERAS[shot.n].b, shot.start + shot.len) })};
  R.fly({ keys: [{ t: 0, ...c.a }, { t: ${shot.len}, ...c.b }], fade: false, labels: false, tilt: false, rings: false });
})()`;

export const ITEMS = SHOTS.map((s) => ({
  id: `homage-${String(s.n).padStart(2, '0')}`, title: `Printer homage shot ${s.n}: ${s.action}`, query: 'mock=garage&time=day&speed=0', seconds: s.len, warmup: 1, fps: 30, setup: setup(s),
}));
