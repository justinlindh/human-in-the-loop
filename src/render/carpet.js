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
  // Warm neutrals at low contrast so team mats and people stay the loudest thing on the floor.
  // Every motif runs along the floor's own axes: a diagonal in texture space lines up with the
  // screen's vertical in the isometric view and reads as a shaft of light.
  if (era === 'classic') {
    // A quiet tile grid.
    ctx.fillRect(0, 0, 1, 0.04);
    ctx.fillRect(0, 0, 0.04, 1);
    ctx.fillRect(0, 0.5, 1, 0.04);
    ctx.fillRect(0.5, 0, 0.04, 1);
  } else if (era === 'chatgbt') {
    // Pinstripes along one wall.
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i / 4, 1, 0.05);
  } else if (era === 'agents') {
    // A small dot grid.
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc((i + 0.5) / 4, (k + 0.5) / 4, 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (era === 'consolidation') {
    // Paired stripes, thin.
    ctx.fillRect(0, 0.2, 1, 0.05);
    ctx.fillRect(0, 0.3, 1, 0.05);
    ctx.fillRect(0, 0.7, 1, 0.05);
    ctx.fillRect(0, 0.8, 1, 0.05);
  } else {
    // Small diamonds on a half-tile grid.
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) {
      const x = (i + 0.5) / 2, y = (k + 0.5) / 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.09); ctx.lineTo(x + 0.09, y);
      ctx.lineTo(x, y + 0.09); ctx.lineTo(x - 0.09, y);
      ctx.closePath(); ctx.fill();
    }
  }
  if (!low) {
    ctx.globalAlpha = 0.06;
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
