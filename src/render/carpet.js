import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

const textures = new Map();
const ERAS = new Set(['classic', 'chatgbt', 'agents', 'consolidation', 'plateau']);

// Broad motifs survive the gameplay zoom; Low omits the fine fibre weave and uses a smaller map.
export function carpetTexture(era = 'classic', low = false) {
  if (!ERAS.has(era)) era = 'classic';
  const key = `${era}:${low}`;
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  const size = low ? 64 : 256;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.scale(size, size);
  ctx.fillStyle = P[`carpet_${era}`];
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = ctx.strokeStyle = P[`carpet_${era}_pattern`];
  if (era === 'classic') {
    ctx.fillRect(0, 0, 0.5, 0.5);
    ctx.fillRect(0.5, 0.5, 0.5, 0.5);
  } else if (era === 'chatgbt') {
    // Diagonal ribbons continue through the repeat edges.
    for (let x = -1; x <= 1; x++) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 0.25, 0);
      ctx.lineTo(x + 1.25, 1); ctx.lineTo(x + 1, 1);
      ctx.closePath(); ctx.fill();
    }
  } else if (era === 'agents') {
    ctx.lineWidth = 0.07;
    ctx.strokeRect(0.17, 0.17, 0.66, 0.66);
    ctx.fillRect(0.42, 0.42, 0.16, 0.16);
  } else if (era === 'consolidation') {
    ctx.fillRect(0, 0, 1, 0.28);
    ctx.fillRect(0, 0.38, 1, 0.06);
  } else {
    ctx.beginPath();
    ctx.moveTo(0.5, 0.08); ctx.lineTo(0.92, 0.5);
    ctx.lineTo(0.5, 0.92); ctx.lineTo(0.08, 0.5);
    ctx.closePath(); ctx.fill();
  }
  if (!low) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = P.paper;
    for (let i = 0; i < size; i += 4) ctx.fillRect(0, i / size, 1, 1 / size);
    ctx.fillStyle = P.ink;
    for (let i = 0; i < size; i += 4) ctx.fillRect(i / size, 0, 1 / size, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `carpet:${key}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = low ? 1 : 8;
  texture.userData.repeat = 2;
  textures.set(key, texture);
  return texture;
}
