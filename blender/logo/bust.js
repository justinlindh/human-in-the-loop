// Browser module (served by vite) for the logo's character: a game character rendered alone, lit
// like the in-game portraits, on a transparent background, with an ink outline round the silhouette
// to match the flat logo parts. Returns a PNG data URL cropped to the character.
import * as THREE from 'three';
import { createCharacter } from '/src/render/character.js';
import { PALETTE, ROLE_COLORS } from '/src/render/palette.js';

export function renderBust(person, { px = 1536, anim = 'wave', animT = 1.6, yaw = 0, outline = 20, maxOut = 720 } = {}) {
  const canvas = document.createElement('canvas');
  const gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.1;
  gl.setClearColor(0x000000, 0);
  gl.setPixelRatio(1);
  gl.setSize(px, px, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.hemi_sky_day), new THREE.Color(PALETTE.hemi_ground_day), 1.6));
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun_day), 2.6);
  key.position.set(1.2, 2.2, 2.0);
  scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(PALETTE.screen_cyan), 1.1);
  rim.position.set(-1.5, 1.4, -1.6);
  scene.add(rim);
  const c = createCharacter(person.appearance, ROLE_COLORS[person.role], { role: person.role, seed: person.id });
  c.setRingScale(0.0001);
  c.pickProxy.visible = false;
  c.setMood('ok');
  // A moment of celebrating first, so the cheeks carry a warm flush into the pose.
  c.setAnim('celebrate');
  for (let i = 0; i < 20; i++) c.update(1 / 30);
  c.setAnim(anim);
  for (let t = 0; t < animT; t += 1 / 30) c.update(1 / 30);
  c.root.traverse((o) => { if (o.isSprite) o.visible = false; });
  c.root.rotation.y = yaw;
  scene.add(c.root);
  // Head and chest, facing the viewer.
  const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 20);
  cam.position.set(0, 0.99, 2.75);
  cam.lookAt(0, 0.81, 0);
  gl.render(scene, cam);

  const full = document.createElement('canvas');
  full.width = full.height = px;
  const ctx = full.getContext('2d');
  const sil = document.createElement('canvas');
  sil.width = sil.height = px;
  const s = sil.getContext('2d');
  s.drawImage(canvas, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = PALETTE.ink;
  s.fillRect(0, 0, px, px);
  for (let a = 0; a < 32; a++) {
    const r = (a / 32) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(r) * outline, Math.sin(r) * outline);
  }
  ctx.drawImage(sil, 0, 0);
  ctx.drawImage(canvas, 0, 0);
  c.dispose();
  gl.dispose();

  // Crop to the drawn pixels, then scale down to at most maxOut on the long side.
  const data = ctx.getImageData(0, 0, px, px).data;
  let x0 = px, y0 = px, x1 = -1, y1 = -1;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    if (data[(y * px + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.min(1, maxOut / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * k); out.height = Math.round(h * k);
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(full, x0, y0, w, h, 0, 0, out.width, out.height);
  return { url: out.toDataURL('image/png'), width: out.width, height: out.height };
}
