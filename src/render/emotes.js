import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

// Emote bubbles drawn once into canvas textures and shared by every character.
export const EMOTES = ['sweat', 'sparkle', 'storm', 'lightbulb', 'heart', 'zzz', 'exclamation', 'music'];

const SIZE = 128;
const textures = new Map();
const materials = new Map();

function bubble(ctx) {
  ctx.lineWidth = 7;
  ctx.strokeStyle = P.ink;
  ctx.fillStyle = P.paper;
  ctx.beginPath();
  ctx.arc(64, 58, 46, 0, Math.PI * 2);
  ctx.moveTo(52, 100);
  ctx.lineTo(64, 122);
  ctx.lineTo(76, 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Refill the join so the tail reads as part of the bubble.
  ctx.beginPath();
  ctx.arc(64, 58, 42, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.38 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

const DRAW = {
  sweat(ctx) {
    ctx.fillStyle = P.screen_blue;
    ctx.beginPath();
    ctx.moveTo(64, 22);
    ctx.bezierCurveTo(78, 44, 90, 58, 90, 70);
    ctx.arc(64, 70, 26, 0, Math.PI);
    ctx.bezierCurveTo(38, 58, 50, 44, 64, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.paper;
    ctx.beginPath();
    ctx.ellipse(55, 70, 5, 9, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  sparkle(ctx) {
    star(ctx, 58, 60, 30, P.gold);
    star(ctx, 88, 32, 13, P.screen_amber);
  },
  storm(ctx) {
    ctx.fillStyle = P.metal_soft;
    ctx.beginPath();
    ctx.arc(46, 54, 16, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(64, 40, 20, Math.PI, Math.PI * 1.9);
    ctx.arc(84, 52, 15, Math.PI * 1.4, Math.PI * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.gold;
    ctx.beginPath();
    ctx.moveTo(66, 66); ctx.lineTo(52, 86); ctx.lineTo(63, 86); ctx.lineTo(56, 102); ctx.lineTo(76, 78); ctx.lineTo(65, 78); ctx.lineTo(72, 66);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },
  lightbulb(ctx) {
    ctx.fillStyle = P.screen_amber;
    ctx.beginPath();
    ctx.arc(64, 50, 22, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(74, 76);
    ctx.lineTo(54, 76);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = P.metal_soft;
    ctx.fillRect(54, 78, 20, 12);
    ctx.strokeRect(54, 78, 20, 12);
    ctx.lineWidth = 5;
    for (const a of [-2.4, -1.57, -0.74]) {
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 30, 50 + Math.sin(a) * 30);
      ctx.lineTo(64 + Math.cos(a) * 40, 50 + Math.sin(a) * 40);
      ctx.stroke();
    }
  },
  heart(ctx) {
    ctx.fillStyle = P.screen_pink;
    ctx.beginPath();
    ctx.moveTo(64, 88);
    ctx.bezierCurveTo(30, 66, 34, 30, 64, 44);
    ctx.bezierCurveTo(94, 30, 98, 66, 64, 88);
    ctx.fill();
    ctx.stroke();
  },
  zzz(ctx) {
    ctx.fillStyle = P.role_sales;
    ctx.font = '800 40px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    for (const [x, y, s] of [[48, 72, 1], [70, 50, 0.8], [86, 32, 0.6]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.strokeText('Z', 0, 0);
      ctx.fillText('Z', 0, 0);
      ctx.restore();
    }
  },
  exclamation(ctx) {
    ctx.fillStyle = P.alarm_red;
    ctx.beginPath();
    ctx.roundRect(54, 24, 20, 44, 9);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 84, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },
  music(ctx) {
    ctx.fillStyle = P.role_engineer;
    ctx.beginPath();
    ctx.ellipse(50, 80, 13, 10, -0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(84, 72, 13, 10, -0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(61, 78); ctx.lineTo(61, 34); ctx.lineTo(95, 26); ctx.lineTo(95, 70);
    ctx.stroke();
  },
};

export function emoteTexture(kind) {
  let t = textures.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  bubble(ctx);
  ctx.lineWidth = 5;
  ctx.strokeStyle = P.ink;
  (DRAW[kind] ?? DRAW.exclamation)(ctx);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textures.set(kind, t);
  return t;
}

export function emoteMaterial(kind) {
  let m = materials.get(kind);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: emoteTexture(kind), depthTest: false, transparent: true });
    materials.set(kind, m);
  }
  return m;
}
