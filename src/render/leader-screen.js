// The all-hands screen on a floor stand for the sledgehammer moment: an invented, droning leader in cold
// grey-blue, mouth going, until a hammer goes through it. The face is drawn into a small canvas a
// few times a second; shatter() swaps in a cracked frame, a white flash and flying shards (all
// skipped on Low, where the screen simply dies).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE as P } from './palette.js';

export const SCREEN_W = 1.7, SCREEN_H = 0.98;   // the picture, metres
const TEX_W = 256, TEX_H = 148;
const FPS = { full: 10, low: 4 };
const FLASH_S = 0.4, SHARD_S = 1.1, SHARDS = 14;
const BG = '#17212b', SKIN = '#c3d4e0', INK = '#1d2832', SUIT = '#3a4a57';

const bezelGeo = new RoundedBoxGeometry(SCREEN_W + 0.12, SCREEN_H + 0.12, 0.07, 2, 0.02);
const bezelMat = new THREE.MeshStandardMaterial({ color: P.metal_dark, roughness: 0.55, metalness: 0.3 });
const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 10);
const footGeo = new RoundedBoxGeometry(0.95, 0.06, 0.5, 2, 0.02);
const shardGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.06, -0.04, 0), new THREE.Vector3(0.07, -0.02, 0), new THREE.Vector3(0, 0.08, 0)]);
const shardMat = new THREE.MeshBasicMaterial({ color: '#dff4ff', side: THREE.DoubleSide, transparent: true });

function drawLeader(ctx, t) {
  const W = TEX_W, H = TEX_H;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  // A faint radial glow behind the head, so the face reads from across the room.
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 8, W / 2, H * 0.45, W * 0.55);
  g.addColorStop(0, 'rgba(150,180,200,0.35)'); g.addColorStop(1, 'rgba(150,180,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // A big bald head filling the screen, close up, so it reads as a face from across the room.
  const cx = W / 2, cy = H * 0.55;
  ctx.fillStyle = SUIT;
  ctx.beginPath(); ctx.ellipse(cx, H + 30, 120, 60, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.ellipse(cx, cy, 62, 74, 0, 0, Math.PI * 2); ctx.fill();
  // Heavy dark glasses and flat, stern brows.
  ctx.fillStyle = INK;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 26, cy - 12, 20, 15, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx - 8, cy - 13); ctx.lineTo(cx + 8, cy - 13); ctx.stroke();
  ctx.lineWidth = 9;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 48, cy - 40); ctx.lineTo(cx + s * 10, cy - 34); ctx.stroke(); }
  ctx.fillStyle = SKIN;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * 22, cy - 15, 3, 0, Math.PI * 2); ctx.fill(); }
  // The droning mouth: never quite closes, never says anything.
  ctx.fillStyle = INK;
  const open = 4 + 12 * Math.abs(Math.sin(t * 8.5) * Math.sin(t * 2.1 + 0.6));
  ctx.beginPath(); ctx.ellipse(cx, cy + 36, 22, open / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
  // Scanlines and a slow roll bar.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  const roll = ((t * 18) % (H + 30)) - 15;
  ctx.fillStyle = 'rgba(200,225,240,0.08)'; ctx.fillRect(0, roll, W, 14);
}

function drawCracked(ctx) {
  const W = TEX_W, H = TEX_H;
  ctx.fillStyle = 'rgba(10,14,18,0.82)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(225,240,250,0.9)'; ctx.lineWidth = 1.5;
  const cx = W * 0.52, cy = H * 0.48;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    let x = cx, y = cy;
    for (let k = 1; k <= 4; k++) { x = cx + Math.cos(a + (k % 2 ? 0.12 : -0.1)) * k * 34; y = cy + Math.sin(a + (k % 2 ? 0.12 : -0.1)) * k * 26; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (const r of [10, 22]) { ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.3, r, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(10,14,18,1)'; ctx.beginPath(); ctx.ellipse(cx, cy, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
}

// low(): whether Low quality is on; height: the picture's centre above the floor, which its stand
// reaches down to. The group's local +z faces the room; its origin is the picture's centre.
export function createLeaderScreen({ low = () => false, height = 1.6 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.name = 'leader-screen';
  const bezel = new THREE.Mesh(bezelGeo, bezelMat);
  bezel.position.z = -0.035;
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: tex }));
  picture.position.z = 0.002;
  picture.name = 'leader-picture';
  // A rolling floor stand: one post and a wide foot.
  const postH = height - SCREEN_H / 2;
  const post = new THREE.Mesh(postGeo, bezelMat);
  post.scale.y = postH;
  post.position.set(0, -SCREEN_H / 2 - postH / 2, -0.06);
  const foot = new THREE.Mesh(footGeo, bezelMat);
  foot.position.set(0, -height + 0.03, -0.06);
  group.add(bezel, picture, post, foot);
  let t = 0, since = Infinity, broken = false, flash = null, shards = null;
  drawLeader(ctx, 0);
  tex.needsUpdate = true;

  function shatter() {
    if (broken) return;
    broken = true;
    if (low()) {
      ctx.fillStyle = '#0b0f13'; ctx.fillRect(0, 0, TEX_W, TEX_H);
      tex.needsUpdate = true;
      return;
    }
    drawCracked(ctx);
    tex.needsUpdate = true;
    flash = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W * 1.15, SCREEN_H * 1.15), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.z = 0.03;
    flash.userData.t = 0;
    flash.userData.noAO = true;
    shards = new THREE.Group();
    for (let i = 0; i < SHARDS; i++) {
      const s = new THREE.Mesh(shardGeo, shardMat);
      const a = (i / SHARDS) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.1, 0.05);
      s.userData.v = new THREE.Vector3(Math.cos(a) * (0.6 + (i % 3) * 0.3), Math.sin(a) * 0.5 + 0.6, 1.2 + (i % 4) * 0.35);
      s.userData.spin = 6 + (i % 5) * 2;
      shards.add(s);
    }
    shards.userData.t = 0;
    group.add(flash, shards);
  }

  function update(dt) {
    t += dt;
    if (!broken) {
      since += dt;
      if (since >= 1 / (low() ? FPS.low : FPS.full)) { since = 0; drawLeader(ctx, t); tex.needsUpdate = true; }
      return;
    }
    if (flash) {
      flash.userData.t += dt;
      const k = flash.userData.t / FLASH_S;
      flash.material.opacity = Math.max(0, 1 - k) ** 1.5;
      flash.scale.setScalar(1 + k * 0.25);
      if (k >= 1) { group.remove(flash); flash.geometry.dispose(); flash.material.dispose(); flash = null; }
    }
    if (shards) {
      shards.userData.t += dt;
      const k = shards.userData.t;
      for (const s of shards.children) {
        s.userData.v.y -= 9.8 * dt;
        s.position.addScaledVector(s.userData.v, dt);
        s.rotation.x += s.userData.spin * dt; s.rotation.z += s.userData.spin * 0.7 * dt;
      }
      shardMat.opacity = Math.max(0, 1 - k / SHARD_S);
      if (k >= SHARD_S) { group.remove(shards); shards = null; shardMat.opacity = 1; }
    }
  }

  function dispose() {
    group.removeFromParent();
    tex.dispose();
    picture.geometry.dispose();
    picture.material.dispose();
    if (flash) { flash.geometry.dispose(); flash.material.dispose(); }
  }

  return { group, picture, update, shatter, dispose, get broken() { return broken; } };
}
