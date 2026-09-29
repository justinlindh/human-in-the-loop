// One picture of one pose-matrix cell: the person with the cell's build, rig, posture and view,
// played to the given time of the gesture, alone on the floor, drawn by the game's own renderer.
// pose.mjs --matrix ... --crop out.png runs this for the worst cell.
//
//   node blender/checks/pose-crop.mjs --gesture facepalm --posture sit --build 1 --rig on --view 0 --t 1.6 --out crop.png
//        [--accessory none] [--warm 1] [--seconds 2.2] [--size 1280] [--crop 220] [--zoom 8]
// Renders on the GPU under the render lock (--software for SwiftShader).
import { startHarness, wantGpu } from './harness.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const out = opt('out');
if (!out || !opt('gesture')) { console.error('pose-crop: --gesture and --out are required'); process.exit(2); }
const POSTURES = { stand: 'idle', sit: 'typing', lie: 'lie' };
const posture = opt('posture', 'stand');
if (!POSTURES[posture]) { console.error(`pose-crop: --posture is one of ${Object.keys(POSTURES).join(', ')}`); process.exit(2); }
const size = Number(opt('size', 1280));
const req = {
  gesture: opt('gesture'), under: POSTURES[posture], view: Number(opt('view', 0)), rig: opt('rig', 'on') !== 'off',
  look: { build: Number(opt('build', 1)), ...(opt('accessory', 'none') !== 'none' ? { accessory: opt('accessory') } : {}) },
  t: Number(opt('t', 1.5)), warm: Number(opt('warm', 1)), seconds: Number(opt('seconds', 2.2)), zoom: Number(opt('zoom', 8)),
};
mkdirSync(dirname(resolve(out)), { recursive: true });
const H = await startHarness({ gpu: wantGpu() });
try {
  const { page } = await H.openScene('quality=high&mock=floor', { width: size, height: size });
  const head = await page.evaluate(async (q) => {
    const R = window.__hitlRender;
    const { createCharacter } = await import('/src/render/character.js');
    const { setRigEnabled } = await import('/src/render/rig.js');
    await setRigEnabled(q.rig);
    // Alone on the floor: everything else in the scene is hidden, lights and background stay.
    const c = window.__tool(() => createCharacter(q.look, undefined, { seed: 'pose' }));
    for (const o of R.scene.children) if (!o.isLight) o.visible = false;
    R.scene.add(c.root);
    c.root.position.set(0, 0, 0);
    // The person faces the camera turned by `view` quarter turns (the same heading pose-measure.js gives it).
    c.root.rotation.y = Math.PI / 4 + (q.view * Math.PI) / 2;
    c.setAnim(q.under);
    const dt = 1 / 30;
    let started = false;
    for (let t = 0; t < q.t + 1e-9; t += dt) {
      if (!started && t >= q.warm - 1e-9) { c.gesture(q.gesture, q.seconds); started = true; }
      c.update(dt);
    }
    c.root.updateMatrixWorld(true);
    for (const id of ['ui', 'labels']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    R.focusAt(0, 0, q.zoom);
    R.render(0);
    // The head's place on the canvas, in pixels, to frame the picture on it.
    const box = document.querySelector('canvas').getBoundingClientRect();
    const p = c.probe().head.clone().project(R.camera);
    return { x: box.left + ((p.x + 1) / 2) * box.width, y: box.top + ((1 - p.y) / 2) * box.height };
  }, req);
  const half = Number(opt('crop', 220));
  const clip = { x: Math.max(0, Math.min(size - 2 * half, head.x - half)), y: Math.max(0, Math.min(size - 2 * half, head.y - half)), width: 2 * half, height: 2 * half };
  await page.screenshot({ path: resolve(out), clip });
  console.log(`pose-crop: wrote ${resolve(out)}`);
} finally {
  await H.close();
}
