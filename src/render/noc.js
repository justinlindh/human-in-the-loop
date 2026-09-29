import * as THREE from 'three';
import { getModel } from './models.js';
import { glow } from './materials.js';

// The NOC (shop item `noc`): where its crew sits or stands, the chairs and floor glow the renderer adds to
// its model, and the look it takes from state (mode, red alert, weeks since the last incident).

// Spots in model space (three.js axes of the glTF, front toward +z), per model. Seats face the screens;
// stands are where the crew gets up to during an alert, a step behind the seats.
const SPOTS = {
  noc_l1: { seats: [{ x: 0.85, z: 0.2, look: [-0.25, -0.1] }], stands: [{ x: 0.35, z: 0.6, look: [-0.25, -0.1] }, { x: -0.5, z: 0.75, look: [-0.25, -0.1] }] },
  noc_l2: {
    seats: [{ x: -0.36, z: 0.97, look: [-0.3, 0] }, { x: 0.36, z: 0.97, look: [0.3, 0] }],
    stands: [{ x: -0.98, z: 1.02, look: [-0.6, 0] }, { x: 0.98, z: 1.02, look: [0.6, 0] }, { x: 0, z: 1.46, look: [0, 0] }],
    chairs: true,
  },
  noc_l3: {
    seats: [{ x: -0.6, z: 0.97, look: [-0.5, 0] }, { x: 0, z: 1.0, look: [0, 0] }, { x: 0.6, z: 0.97, look: [0.5, 0] }],
    stands: [{ x: -1.18, z: 1.0, look: [-0.8, 0] }, { x: 1.18, z: 1.0, look: [0.8, 0] }, { x: -0.3, z: 1.46, look: [-0.2, 0] }, { x: 0.3, z: 1.46, look: [0.2, 0] }],
    chairs: true,
  },
};

// How far a chair's centre sits behind its sitter's spot, as at a desk.
const CHAIR_IN = 0.05;

function toItem(fit, x, z) {
  const v = new THREE.Vector3(x, 0, z).applyMatrix4(fit);
  return { x: v.x, z: v.z };
}

// Seats and stands for a built NOC group, in the item's local frame (origin at the footprint centre).
function localSpots(g) {
  const s = SPOTS[g.userData.model];
  if (!s) return { seats: [], stands: [] };
  const fit = g.userData.fit;
  const conv = (p) => {
    const at = toItem(fit, p.x, p.z);
    const look = toItem(fit, p.look[0], p.look[1]);
    return { x: at.x, z: at.z, yaw: Math.atan2(look.x - at.x, look.z - at.z) };
  };
  return { seats: s.seats.map(conv), stands: s.stands.map(conv) };
}

// Floor rectangles (item frame, [x0, z0, x1, z1]) the NOC blocks past its footprint: its chairs and the
// seat behind each, entered from behind as at a desk. The desk's overhang is part of the model box.
export function nocObstacles(g) {
  const n = g.userData.noc;
  if (!n || n.level < 2) return [];
  return n.seats.map((s) => [s.x - 0.32, s.z - 0.15, s.x + 0.32, s.z + 0.34]);
}

// Radial floor glow texture, shared.
let glowTex = null;
function floorGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const BLUE = new THREE.Color('#4aa8ff'), RED = new THREE.Color('#ff3b3b'), CYAN = new THREE.Color('#5fe0d0');

// Adds the NOC's extras to a built placed-item group: chairs at level 2 and up, a darkened floor and a
// floor glow in front of the screens (levels 2 and 3), and a glow material of its own for the light
// strips so red alert does not recolour every cyan light in the office.
export function dressNoc(g, inner, f) {
  const s = SPOTS[g.userData.model];
  if (!s) return;
  const level = Number(g.userData.model.slice(-1));
  const spots = localSpots(g);
  g.userData.noc = { level, ...spots, strips: null, glow: null, beacon: null };
  if (s.chairs) {
    for (const seat of spots.seats) {
      const ch = getModel('chair');
      ch.position.set(seat.x - Math.sin(seat.yaw) * CHAIR_IN, 0, seat.z - Math.cos(seat.yaw) * CHAIR_IN);
      ch.rotation.y = seat.yaw;
      g.add(ch);
    }
  }
  const strips = glow('screen_cyan', 3, 'noc');
  inner.traverse((c) => {
    if (!c.isMesh) return;
    if (c.name === 'noc_beacon_led') { g.userData.noc.beacon = c; c.userData.dynamic = true; return; }
    const swap = (m) => (m?.name === 'glow_screen_cyan' ? strips : m);
    c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material);
  });
  g.userData.noc.strips = strips;
  if (level >= 2) {
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h + 1), new THREE.MeshBasicMaterial({ color: '#0d1020', transparent: true, opacity: 0.35, depthWrite: false }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.set(0, 0.006, 0.5);
    dark.renderOrder = 1;
    dark.userData.dynamic = true;
    g.add(dark);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(f.w + 0.6, 1.8), new THREE.MeshBasicMaterial({ map: floorGlowTexture(), color: BLUE.clone(), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.009, 0.1);
    pool.renderOrder = 2;
    pool.userData.dynamic = true;
    g.add(pool);
    g.userData.noc.glow = pool;
  }
}

// What the NOC shows, from state only.
export function nocLook(state) {
  const log = state?.incidentLog ?? [];
  const last = log.length ? log[log.length - 1].week : null;
  const week = state?.week ?? 0;
  return {
    mode: state?.ops?.noc === 'agents' ? 'agents' : 'humans',
    alert: !!state?.outage || last === week,
    // Weeks since the last incident, shown as days; with none on record, the weeks the company has run.
    days: Math.max(0, (last === null ? week : week - last) * 7),
    quiet: !state?.outage && (last === null || week - last >= QUIET_WEEKS),
  };
}

// Weeks without an incident before the crew starts dozing at the desk.
export const QUIET_WEEKS = 4;

// Applies the alert to a placed NOC's strips, beacon and floor glow; t is seconds, for the beacon's flash.
export function paintNoc(n, alert, t, low) {
  if (!n) return;
  const on = alert && Math.sin(t * 7) > 0;
  n.strips.emissive.copy(alert ? RED : CYAN);
  if (n.beacon) n.beacon.visible = alert;
  if (n.beacon) n.beacon.scale.setScalar(on ? 1.15 : 0.9);
  if (n.glow) {
    n.glow.visible = !low;
    n.glow.material.color.copy(alert ? RED : BLUE);
    n.glow.material.opacity = alert ? (on ? 0.6 : 0.35) : 0.4;
  }
}
