import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Shared, cached materials. Everything with the same look shares one material instance so
// draw state stays cheap and time-of-day or alert changes touch one object.

const cache = new Map();
const colorCache = new Map();

export function color(name) {
  let c = colorCache.get(name);
  if (!c) {
    const hex = PALETTE[name] ?? (name.startsWith('#') ? name : null);
    if (!hex) throw new Error(`palette: unknown color ${name}`);
    c = new THREE.Color(hex);
    colorCache.set(name, c);
  }
  return c;
}

// Surface character by palette family: [roughness, metalness].
function surface(name) {
  if (name.startsWith('metal')) return [0.42, 0.25];
  if (name.startsWith('fabric') || name.startsWith('rug') || name.startsWith('floor_carpet')) return [0.95, 0];
  if (name.startsWith('plastic') || name === 'laminate' || name === 'whiteboard' || name === 'mug') return [0.5, 0];
  if (name.startsWith('wood') || name.startsWith('floor_wood')) return [0.62, 0];
  if (name.startsWith('leaf')) return [0.7, 0];
  if (name.startsWith('skin')) return [0.75, 0];
  if (name === 'gold') return [0.35, 0.4];
  if (name.startsWith('floor_tile')) return [0.45, 0];
  return [0.82, 0];
}

let toonRamp = null;
function ramp() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 150, 205, 255]);
  toonRamp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

// Standard lit material for a palette color. opts: { toon, flat, side, key }.
export function mat(name, opts = {}) {
  const key = `${opts.key ?? ''}|${name}|${opts.toon ? 't' : ''}${opts.flat ? 'f' : ''}${opts.side ?? ''}`;
  let m = cache.get(key);
  if (m) return m;
  if (opts.toon) {
    m = new THREE.MeshToonMaterial({ color: color(name), gradientMap: ramp() });
  } else {
    const [roughness, metalness] = surface(name);
    m = new THREE.MeshStandardMaterial({ color: color(name), roughness, metalness });
  }
  if (opts.flat) m.flatShading = true;
  if (opts.side) m.side = opts.side;
  m.name = `pal_${name}`;
  cache.set(key, m);
  return m;
}

// Emissive glow. Intensity above ~1 crosses the bloom threshold.
export function glow(name, intensity = 2, key = '') {
  const k = `glow|${key}|${name}|${intensity}`;
  let m = cache.get(k);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: color('screen_bg'), emissive: color(name), emissiveIntensity: intensity, roughness: 0.35, metalness: 0,
  });
  m.name = `glow_${name}`;
  cache.set(k, m);
  return m;
}

export function glass() {
  let m = cache.get('glass');
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: color('glass'), roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false,
  });
  m.name = 'pal_glass';
  cache.set('glass', m);
  return m;
}

// Solid-color material that is not shared, for per-character tints.
export function tinted(hex, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness: 0 });
}

// Special glTF slot names that the renderer fills at runtime rather than from the palette.
const SLOTS = {
  screen: () => glow('screen_blue', 1.6),
  led: () => glow('led_green', 4),
  led_amber: () => glow('led_amber', 4),
  led_red: () => glow('led_red', 4),
  lamp: () => glow('lamp_warm', 2.5),
  glass: () => glass(),
  window: () => glow('window_day', 0.4, 'window'),
};

// Resolve a glTF material name `pal_<name>` (Blender may append `.001`) to a shared material.
// Returns null for names that are not palette slots so the caller can keep the original.
export function paletteMaterial(gltfName) {
  const m = /^pal_([a-z0-9_]+?)(?:\.\d+)?$/.exec(gltfName ?? '');
  if (!m) return null;
  const name = m[1];
  if (SLOTS[name]) return SLOTS[name]();
  if (PALETTE[name]) return mat(name);
  return null;
}

export const SLOT_NAMES = Object.keys(SLOTS);
