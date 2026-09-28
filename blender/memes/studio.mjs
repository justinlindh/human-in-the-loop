// Yak memes drawn in the game's style: small studio scenes built from the game's own character kit,
// palette and lighting, with a free camera and hand-set poses, framed like the engine-captured memes
// (paper, ink, Fredoka). Video wires the images into public/memes.
//
//   node blender/memes/studio.mjs --out <dir> [--only is_this_agi,distracted_founder,the_bill,the_plan]
//
// Writes <id>.png at 1200x900 for each meme.
import { startHarness } from '../checks/harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const OUT = arg('--out') ?? 'shots/memes';
const ONLY = arg('--only')?.split(',') ?? null;
const MEMES = ['is_this_agi', 'distracted_founder', 'the_bill', 'the_plan', 'change_my_mind'].filter((m) => !ONLY || ONLY.includes(m));
mkdirSync(OUT, { recursive: true });

// Runs in the page: builds and renders one meme, returns a PNG data URL.
async function render(id) {
  const R = window.__hitlRender, T = R.THREE;
  const { createCharacter } = await import('/src/render/character.js');
  const { PALETTE: P, ROLE_COLORS } = await import('/src/render/palette.js');
  const { RoundedBoxGeometry } = await import('/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js');
  await document.fonts.load('700 60px Fredoka');
  const W = 1200, H = 900;

  // A lit set: floor, a back wall with wainscot, portrait lighting, soft shadows.
  function studio({ wall = P.wall_cream } = {}) {
    const scene = new T.Scene();
    scene.background = new T.Color(P.paper);
    scene.add(new T.HemisphereLight(new T.Color(P.hemi_sky_day), new T.Color(P.hemi_ground_day), 1.4));
    const key = new T.DirectionalLight(new T.Color(P.sun_day), 2.4);
    key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    scene.add(key);
    const mat = (c, extra = {}) => new T.MeshStandardMaterial({ color: new T.Color(c), roughness: 0.85, ...extra });
    const floor = new T.Mesh(new T.PlaneGeometry(16, 10), mat(P.carpet_classic, { roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const back = new T.Mesh(new T.PlaneGeometry(16, 6), mat(wall)); back.position.set(0, 3, -1.6); back.receiveShadow = true; scene.add(back);
    const wain = new T.Mesh(new RoundedBoxGeometry(16, 0.9, 0.06, 2, 0.02), mat(P.wood_light, { roughness: 0.7 })); wain.position.set(0, 0.45, -1.57); scene.add(wain);
    return { scene, mat };
  }
  const box = (w, h, d, material, x, y, z) => { const m = new T.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.15), material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };
  function windowOn(scene, mat, x, y) {
    scene.add(box(1.5, 1.1, 0.08, mat(P.paper), x, y, -1.56));
    const pane = new T.Mesh(new T.PlaneGeometry(1.3, 0.9), mat(P.window_day, { emissive: new T.Color(P.window_day), emissiveIntensity: 0.4 }));
    pane.position.set(x, y, -1.51); scene.add(pane);
  }
  function plant(scene, mat, x, z) {
    scene.add(box(0.36, 0.34, 0.36, mat(P.terracotta ?? P.fabric_terracotta), x, 0.17, z));
    for (const [dx, dy, s] of [[0, 0.62, 0.3], [-0.12, 0.5, 0.22], [0.13, 0.52, 0.2], [0.02, 0.82, 0.18]]) {
      const leaf = new T.Mesh(new T.IcosahedronGeometry(s, 1), mat(P.plant_green ?? P.fabric_sage, { flatShading: true }));
      leaf.position.set(x + dx, dy, z); leaf.castShadow = true; scene.add(leaf);
    }
  }
  // A person from the character kit, posed: anim, then optional shoulder angles and head turn.
  function person(scene, look, role, { at = [0, 0], yaw = 0, anim = 'idle', arms = null, head = null, mood = 'ok', emote = null, seed } = {}) {
    const c = createCharacter(look, ROLE_COLORS[role], { role, seed: seed ?? `meme-${JSON.stringify(look)}` });
    c.setRingScale(0.0001); c.pickProxy.visible = false;
    c.root.position.set(at[0], 0, at[1]); c.root.rotation.y = yaw;
    c.setMood(mood); c.setAnim(anim);
    if (emote) c.setEmote(emote);
    for (let i = 0; i < 45; i++) c.update(1 / 30);
    const [l, r] = c.shoulders();
    if (arms?.l) l.rotation.set(...arms.l);
    if (arms?.r) r.rotation.set(...arms.r);
    if (head) c.head.rotation.set(...head);
    c.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(c.root);
    return c;
  }
  function shoot(scene, camPos, look, h = 740) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = h;
    const gl = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    gl.outputColorSpace = T.SRGBColorSpace; gl.toneMapping = T.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
    gl.shadowMap.enabled = true; gl.shadowMap.type = T.PCFSoftShadowMap;
    const cam = new T.PerspectiveCamera(28, W / h, 0.1, 50);
    cam.position.set(...camPos); cam.lookAt(...look);
    gl.setSize(W, h, false); gl.render(scene, cam);
    const proj = (v) => { const p = new T.Vector3(...v).project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * h]; };
    return { canvas, proj };
  }
  // The frame every meme shares: paper, an ink border, Fredoka captions, labels with a paper halo.
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d');
  x.fillStyle = P.paper; x.fillRect(0, 0, W, H);
  const text = (t, cx, cy, size, color = P.ink, halo = false) => {
    x.font = `700 ${size}px Fredoka`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (halo) { x.lineWidth = 10; x.strokeStyle = P.paper; x.lineJoin = 'round'; x.strokeText(t, cx, cy); }
    x.fillStyle = color; x.fillText(t, cx, cy);
  };
  const rule = (y) => { x.fillStyle = P.ink; x.fillRect(0, y - 5, W, 10); };
  const border = () => { x.lineWidth = 16; x.strokeStyle = P.ink; x.strokeRect(8, 8, W - 16, H - 16); };
  const founder = { skin: 2, hair: 3, hairColor: '#4a3222', shirt: '#e8e2d6', pants: '#3a3f4a', build: 1, accessory: 'glasses' };

  if (id === 'is_this_agi') {
    const { scene, mat } = studio();
    windowOn(scene, mat, 1.5, 1.9);
    plant(scene, mat, 2.1, -1.1);
    // The founder points up at the bubble, head tipped up to it.
    person(scene, founder, 'marketer', { at: [-0.55, 0.3], yaw: 1.25, anim: 'point', arms: { r: [-2.3, 0, -0.15] }, head: [-0.2, -0.45, -0.1] });
    // The "butterfly": a glowing chat bubble with typing dots, where the finger points.
    const bubble = new T.Group();
    const glowMat = mat(P.screen_cyan, { emissive: new T.Color(P.screen_cyan), emissiveIntensity: 0.6, roughness: 0.4 });
    bubble.add(new T.Mesh(new RoundedBoxGeometry(0.62, 0.4, 0.14, 4, 0.12), glowMat));
    const tail = new T.Mesh(new T.ConeGeometry(0.08, 0.16, 12), glowMat); tail.position.set(-0.22, -0.24, 0); tail.rotation.z = -0.6; bubble.add(tail);
    const dot = mat(P.paper, { emissive: new T.Color(P.paper), emissiveIntensity: 0.4 });
    for (const dx of [-0.15, 0, 0.15]) { const d = new T.Mesh(new T.SphereGeometry(0.045, 16, 12), dot); d.position.set(dx, 0, 0.08); bubble.add(d); }
    bubble.position.set(0.15, 1.6, 0.55); bubble.rotation.y = -0.3; scene.add(bubble);
    const light = new T.PointLight(new T.Color(P.screen_cyan), 1.2, 2.5); light.position.copy(bubble.position); scene.add(light);
    const spark = new T.MeshBasicMaterial({ color: new T.Color(P.lamp_warm) });
    for (const [sx, sy, sz, s] of [[0.6, 1.9, 0.5, 0.05], [-0.2, 1.95, 0.55, 0.035], [0.55, 1.35, 0.6, 0.03]]) { const m = new T.Mesh(new T.OctahedronGeometry(s), spark); m.position.set(sx, sy, sz); m.rotation.set(0.6, 0.4, 0); scene.add(m); }
    const { canvas, proj } = shoot(scene, [0.9, 1.15, 4.8], [0.12, 0.98, 0.2]);
    x.drawImage(canvas, 0, 20);
    const [bx, by] = proj([0.2, 1.18, 0.55]);
    const [fx, fy] = proj([-0.55, 0.3, 0.3]);
    text('autocomplete', bx, by + 20, 50, P.ink, true);
    text('founder', fx - 40, fy + 20, 50, P.ink, true);
    rule(765); text('Is this AGI?', W / 2, 835, 80); border();
  }

  if (id === 'distracted_founder') {
    const { scene, mat } = studio({ wall: P.wall_warm });
    windowOn(scene, mat, -2.2, 1.9); plant(scene, mat, -3.2, -1.1);
    // Left to right: the new AI feature walking past, the founder turning to look, the product glaring.
    person(scene, { skin: 4, hair: 5, hairColor: '#b5562b', shirt: P.screen_cyan, pants: '#2e3440', build: 1, accessory: 'none' }, 'designer', { at: [-1.3, 0.35], yaw: -1.2, anim: 'walk', head: [0, 0.35, 0] });
    person(scene, founder, 'marketer', { at: [0.15, 0.2], yaw: 0.6, anim: 'walk', head: [0, -1.35, 0.12], emote: 'sparkle' });
    person(scene, { skin: 1, hair: 2, hairColor: '#2a2630', shirt: P.fabric_slate, pants: '#3b3a40', build: 1, accessory: 'none' }, 'support', { at: [0.9, 0.05], yaw: -0.9, anim: 'idle', arms: { l: [-0.3, 0, 0.6], r: [-0.3, 0, -0.6] }, head: [0.1, -0.35, 0], mood: 'coasting', emote: 'storm' });
    const { canvas, proj } = shoot(scene, [0.0, 1.05, 4.6], [-0.1, 0.95, 0]);
    x.drawImage(canvas, 0, 20);
    const lab = (t, p, dy = 0) => { const [lx, ly] = proj(p); x.font = '700 44px Fredoka'; const half = x.measureText(t).width / 2 + 30; text(t, Math.min(W - half, Math.max(half, lx)), ly + dy, 44, P.ink, true); };
    lab('new AI feature', [-1.3, 0.45, 0.35]);
    lab('founder', [0.1, 0.45, 0.2], 0);
    lab('our actual product', [1.15, 0.2, 0.05], 70);
    rule(765); text('Priorities', W / 2, 835, 80); border();
  }

  if (id === 'the_bill') {
    // A tight portrait: the founder recoiling, eyes on the invoice to their left.
    const { scene } = studio();
    person(scene, founder, 'marketer', { at: [0, 0], yaw: -0.5, anim: 'recoil', head: [-0.12, -0.25, 0.08], mood: 'burnout', emote: 'exclamation' });
    const { canvas } = shoot(scene, [0.35, 1.3, 3.0], [0, 1.15, 0], 740);
    // Portrait on the right, the invoice on the left, drawn in 2D.
    x.drawImage(canvas, 330, 70, 870, 740, 400, 20, 800, 680);
    x.save(); x.translate(80, 60); x.rotate(-0.04);
    x.fillStyle = '#fffdf8'; x.strokeStyle = P.ink; x.lineWidth = 6; x.beginPath(); x.roundRect(0, 0, 360, 680, 14); x.fill(); x.stroke();
    const row = (t, v, y, size = 30, bold = false) => { x.font = `${bold ? 700 : 600} ${size}px Fredoka`; x.fillStyle = P.ink; x.textAlign = 'left'; x.fillText(t, 26, y); x.textAlign = 'right'; x.fillText(v, 334, y); };
    x.font = '700 40px Fredoka'; x.textAlign = 'left'; x.fillStyle = P.ink; x.fillText('Cloud bill', 26, 64);
    x.fillStyle = P.metal_soft; x.fillRect(26, 88, 308, 4);
    [['GPU hours', '$28,410'], ['Tokens', '$9,882'], ['Storage', '$1,204'], ['Egress', '$1,391'], ['Support', '$113'], ['That one test', '$0.04']].forEach(([a, b], i) => row(a, b, 140 + i * 56));
    x.fillStyle = P.ink; x.fillRect(26, 480, 308, 5);
    row('Total', '$41,000.04', 530, 34, true);
    x.fillStyle = P.alarm_red; x.font = '700 30px Fredoka'; x.textAlign = 'left'; x.fillText('Users: 12', 26, 600);
    x.restore();
    rule(765); text('Month one', W / 2, 835, 80); border();
  }

  if (id === 'the_plan') {
    // Four panels, Gru style: the founder presents a plan on a flip board; the last line turns on them.
    const lines = ['1. Add AI', '2. Raise a round', '3. The product is the AI', '4. The AI is the product manager'];
    const shots = [];
    for (let i = 0; i < 4; i++) {
      const { scene, mat } = studio();
      const last = i === 3;
      person(scene, founder, 'marketer', { at: [-0.5, 0.2], yaw: last ? 0.2 : 0.9, anim: last ? 'recoil' : 'point', arms: last ? null : { r: [-1.6, 0, -0.25] }, head: last ? [0, 0.2, 0.05] : [0, -0.35, 0], mood: last ? 'burnout' : 'ok', emote: last ? 'exclamation' : null, seed: 'meme-plan' });
      scene.add(box(1.05, 0.8, 0.06, mat(P.paper), 0.62, 1.2, -0.1));
      for (const lx of [0.22, 1.02]) scene.add(box(0.05, 1.25, 0.05, mat(P.metal_soft), lx, 0.62, -0.1));
      shots.push(shoot(scene, [0.1, 1.15, 3.3], [0.1, 1.0, 0], 740));
    }
    const pw = W / 2, ph = (H - 10) / 2;
    shots.forEach(({ canvas, proj }, i) => {
      const px = (i % 2) * pw, py = Math.floor(i / 2) * (ph + 10);
      x.drawImage(canvas, 150, 0, 900, 640, px, py, pw, ph);
      // The board's writing, placed on the board as the camera sees it.
      const [bx, by] = proj([0.62, 1.2, -0.06]);
      const sx = (bx - 150) * pw / 900 + px, sy = by * ph / 640 + py;
      x.save(); x.font = '700 34px Fredoka'; x.fillStyle = i === 3 ? P.alarm_red : P.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
      const rows = [['1. Add', 'AI'], ['2. Raise', 'a round'], ['3. The product', 'is the AI'], ['4. The AI is', 'the product', 'manager']][i];
      rows.forEach((r, k) => x.fillText(r, sx, sy + (k - (rows.length - 1) / 2) * 40));
      x.restore();
    });
    x.fillStyle = P.ink; x.fillRect(pw - 5, 0, 10, H); x.fillRect(0, ph, W, 10);
    border();
  }
  if (id === 'change_my_mind') {
    // The format with an office object in the chair: the printer, at a folding table, behind its sign.
    const { printerModel } = await import('/src/render/props.js');
    const { scene, mat } = studio({ wall: P.wall_sage });
    windowOn(scene, mat, -1.6, 1.9); plant(scene, mat, 1.9, -1.1);
    const wood = mat(P.wood_light, { roughness: 0.6 }), metal = mat(P.metal_soft, { roughness: 0.5 });
    scene.add(box(1.5, 0.06, 0.75, wood, 0, 0.74, 0.3));
    for (const [lx, lz] of [[-0.68, 0], [0.68, 0], [-0.68, 0.6], [0.68, 0.6]]) scene.add(box(0.05, 0.72, 0.05, metal, lx, 0.36, lz));
    const printer = printerModel(); printer.scale.setScalar(1.6); printer.position.set(0, 0.77, 0.05); printer.rotation.y = 0.15;
    printer.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(printer);
    const mug = new T.Mesh(new T.CylinderGeometry(0.06, 0.055, 0.12, 20), mat(P.marker_orange)); mug.position.set(0.52, 0.83, 0.45); mug.castShadow = true; scene.add(mug);
    // The sign on the table's front, drawn like marker on card.
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512;
    const g = sc.getContext('2d'); g.fillStyle = '#fffdf8'; g.fillRect(0, 0, 1024, 512); g.strokeStyle = P.ink; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 498);
    g.fillStyle = P.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 84px Fredoka'; g.fillText('PC LOAD LETTER', 512, 130); g.font = '700 70px Fredoka'; g.fillText('is a valid error', 512, 235);
    g.fillStyle = P.alarm_red; g.font = '700 92px Fredoka'; g.fillText('CHANGE MY MIND', 512, 380);
    const tex = new T.CanvasTexture(sc); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const sign = new T.Mesh(new T.PlaneGeometry(1.2, 0.6), new T.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    sign.position.set(0, 0.45, 0.68); sign.rotation.x = -0.12; scene.add(sign);
    const { canvas } = shoot(scene, [1.25, 1.45, 3.9], [0.05, 0.82, 0.3], 860);
    x.drawImage(canvas, 0, 20);
    border();
  }
  return out.toDataURL('image/png');
}

const H = await startHarness({ browsers: 1 });
try {
  for (const id of MEMES) {
    const { page } = await H.openScene('mock=garage&quality=high&rig=0', { width: 1200, height: 900 });
    const url = await page.evaluate(render, id);
    writeFileSync(join(OUT, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`meme: ${join(OUT, `${id}.png`)}`);
    await page.close();
  }
} finally {
  await H.close?.();
  process.exit(0);
}
