// Stand-ins for the printer homage animatic: a flat field, a printer box and three capsule figures
// (K purple, T white, S striped) moving on simple tracks over the cut's time. Served by the dev server so
// it shares the game's three.js. build(scene) returns update(T) for cut time T in seconds.
import * as THREE from 'three';

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (u) => Math.min(1, Math.max(0, u));
// Piecewise-linear track of [t, x, z] keys.
const track = (keys) => (T) => {
  if (T <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    if (T <= keys[i][0]) { const u = (T - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]); return [lerp(keys[i - 1][1], keys[i][1], u), lerp(keys[i - 1][2], keys[i][2], u)]; }
  }
  const k = keys[keys.length - 1]; return [k[1], k[2]];
};
// Where each figure stands, walking out from the left, then round the printer.
export const TRACKS = {
  K: track([[0, -14, 6.6], [3.8, -12, 6.0], [15, -1.6, 1.0], [16.4, -1.2, 0.9], [17.6, -0.6, 0.5], [19, -1.3, 0.8], [30, -1.3, 0.8], [81.47, -1.3, 0.8]]),
  T: track([[0, -14.5, 5.4], [3.8, -12.2, 4.8], [15, -1.8, 1.8], [19.5, 1.3, 0.9], [81.47, 1.3, 0.9]]),
  S: track([[0, -13.5, 6.2], [3.8, -11.5, 5.4], [15, -2.4, 0.4], [30, 0.3, -1.4], [81.47, 0.3, -1.4]]),
};
const COLORS = { K: 0x7a58b8, T: 0xf2f2ee, S: 0x8aa088 };

function figure(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.45, 4, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  body.position.y = 0.45; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.8 }));
  head.position.y = 1.0; g.add(head);
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xb98a4a }));
  bat.position.set(0.28, 0.55, 0.0); bat.rotation.z = -0.3; g.add(bat);
  g.userData.bat = bat;
  return g;
}

export function build(scene) {
  // Everything the office drew stays hidden; the lights and sky stay.
  for (const c of scene.children) if (!c.isLight && !c.isCamera) c.visible = false;
  const root = new THREE.Group(); scene.add(root);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x8a9a5a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; root.add(ground);
  const printer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.45), new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.7 }));
  printer.position.y = 0.15; root.add(printer);
  const figs = {};
  for (const k of ['K', 'T', 'S']) { figs[k] = figure(COLORS[k]); root.add(figs[k]); }
  return function update(T) {
    for (const k of ['K', 'T', 'S']) {
      const [x, z] = TRACKS[k](T), f = figs[k];
      const [px, pz] = TRACKS[k](T + 0.2);
      f.position.set(x, 0, z);
      // Walking facing the way it moves, standing facing the printer.
      const moving = Math.hypot(px - x, pz - z) > 0.001;
      f.rotation.y = moving ? Math.atan2(px - x, pz - z) : Math.atan2(-x, -z);
      // The walk bob, and the swings: a bat swing every three seconds from 35 s for S.
      f.children[0].position.y = 0.45 + (moving ? Math.abs(Math.sin(T * 7)) * 0.04 : 0);
      const swing = k === 'S' && T > 35 ? clamp01(Math.sin((T - 35) * 2.1) * 2) : 0;
      f.userData.bat.rotation.x = swing * -2.2;
      f.userData.bat.rotation.z = -0.3;
    }
    // The printer ends in pieces: it tilts after the kick and sinks as the bat works.
    printer.rotation.z = T > 17.5 ? 0.35 : 0;
    printer.scale.y = T > 40 ? Math.max(0.35, 1 - (T - 40) * 0.05) : 1;
  };
}
