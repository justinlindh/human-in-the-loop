import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

// A cartoon fire: a cluster of tall tongues, orange at the root to red-orange at the curled tip,
// each round a yellow core, plus a soft glow and a warm light. The tongues skip tone mapping so they
// stay saturated, and the cores go just past 1 so the bloom pass catches them.
//
// createFlame({ height, tongues, low }) -> THREE.Group, standing on y = 0, about `height` metres tall.
//   group.userData.tick(dt) advances the flicker (props call it every frame); update(t) sets it to a time.
//   group.userData.light is the point light (null under Low, which also skips the glow sprite).
//   group.userData.dispose() frees its geometry, materials and texture.

const BRIGHT = 1.0;          // outer tongues sit just under the bloom threshold
const CORE_BRIGHT = 1.35;    // cores cross it
const SEGMENTS = 18;
const LIGHT = 1.0;           // point light intensity per metre of flame
const GLOW = 0.4;            // glow sprite opacity

// Tongue outline from root (y 0) to tip (y 1): widest a fifth of the way up, then a long concave
// taper to a sharp point.
function profile(width) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const y = i / 16;
    const r = y < 0.2 ? width * Math.sqrt(y / 0.2) : width * Math.pow((1 - y) / 0.8, 1.15);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  return pts;
}

// One tongue: a lathe teardrop with a colour ramp in its vertex colours, bent into an S near the tip.
function tongueGeometry(width, from, to, lean) {
  const g = new THREE.LatheGeometry(profile(width), SEGMENTS);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(from), b = new THREE.Color(to), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + lean * y * y * y);
    c.copy(a).lerp(b, Math.min(1, y * 1.25));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

let glowTexture = null;
function glowMap() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const x = canvas.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

export function createFlame({ height = 1, tongues = 5, low = false } = {}) {
  const group = new THREE.Group();
  group.name = 'flame';
  const outerMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  outerMat.color.setScalar(BRIGHT);
  const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  coreMat.color.setScalar(CORE_BRIGHT);
  const geos = [];
  // The middle tongue is the tallest; the others lean out to either side and a little forward.
  const layout = [
    { x: 0, z: 0, h: 1, w: 0.2, lean: 0.1, phase: 0 },
    { x: -0.15, z: 0.04, h: 0.68, w: 0.16, lean: -0.14, phase: 1.7 },
    { x: 0.16, z: 0.03, h: 0.76, w: 0.16, lean: 0.15, phase: 3.1 },
    { x: 0.03, z: -0.12, h: 0.58, w: 0.15, lean: -0.08, phase: 4.4 },
    { x: -0.05, z: 0.13, h: 0.44, w: 0.13, lean: 0.12, phase: 5.2 },
  ].slice(0, Math.max(1, Math.min(5, tongues)));
  const parts = [];
  for (const t of layout) {
    const outerGeo = tongueGeometry(t.w * height, P.flame_mid, P.flame_base, t.lean * height);
    const coreGeo = tongueGeometry(t.w * height * 0.62, P.flame_core, P.flame_tip, t.lean * height * 0.7);
    geos.push(outerGeo, coreGeo);
    const tongue = new THREE.Group();
    tongue.position.set(t.x * height, 0, t.z * height);
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.scale.y = t.h * height;
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.scale.y = t.h * height * 0.66;
    outer.renderOrder = 1;
    tongue.add(core, outer);
    group.add(tongue);
    parts.push({ tongue, outer, core, t });
  }
  let glow = null, light = null;
  if (!low) {
    const glowMat = new THREE.SpriteMaterial({ map: glowMap(), color: new THREE.Color(P.flame_glow), transparent: true, opacity: GLOW, depthWrite: false, blending: THREE.AdditiveBlending });
    glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(height * 1.5);
    glow.position.y = height * 0.38;
    group.add(glow);
    light = new THREE.PointLight(new THREE.Color(P.flame_glow), LIGHT * height, height * 2.5, 2);
    light.position.y = height * 0.5;
    group.add(light);
  }
  let time = 0;
  function update(t) {
    time = t;
    for (const { tongue, outer, core, t: s } of parts) {
      const f = Math.sin(t * 9.1 + s.phase) * 0.5 + Math.sin(t * 14.3 + s.phase * 2.1) * 0.3 + Math.sin(t * 23.7 + s.phase) * 0.2;
      outer.scale.y = s.h * height * (1 + 0.1 * f);
      core.scale.y = s.h * height * 0.66 * (1 + 0.14 * f);
      const w = 1 - 0.05 * f;
      outer.scale.x = outer.scale.z = w;
      tongue.rotation.z = 0.07 * Math.sin(t * 5.3 + s.phase);
      tongue.rotation.x = 0.04 * Math.sin(t * 4.1 + s.phase * 1.3);
    }
    const g = Math.sin(t * 11.3) * 0.5 + Math.sin(t * 17.9) * 0.5;
    if (light) light.intensity = LIGHT * height * (1 + 0.18 * g);
    if (glow) glow.material.opacity = GLOW * (1 + 0.12 * g);
  }
  update(0);
  group.userData.light = light;
  group.userData.update = update;
  group.userData.tick = (dt) => update(time + dt);
  group.userData.dispose = () => {
    for (const g of geos) g.dispose();
    outerMat.dispose(); coreMat.dispose();
    glow?.material.dispose();
    light?.dispose();
  };
  return group;
}
