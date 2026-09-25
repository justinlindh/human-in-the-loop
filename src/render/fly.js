import * as THREE from 'three';

// A flying perspective camera for trailer shots, dev only: never reachable from the game's UI.
// The renderer draws through it while a path is set (renderer.fly(path)), then hands back to the
// isometric rig.
//
// createFly({ getWallH }) -> { camera, set(path), clear(), step(dt) -> bool, active, t, warnings }
//   path: { keys: [{ t, pos: [x, y, z], look: [x, y, z], fov }], fade, labels, tilt, rings }
//     keys in seconds from the start; position and look-at follow a Catmull-Rom curve through the
//     keys, eased in and out over the whole move, and the field of view eases between keys.
//     fade / labels / tilt / rings: keep the column fade, the name and speech labels, the
//     tilt-shift and the floor rings (all off unless set).
//   The office has no ceiling, so the top of the frame must stay below where one would be: a frame
//   whose top edge rises above the wall tops while the camera is below them is reported in warnings
//   (and on the console once per path).

const UP = new THREE.Vector3(0, 1, 0);

function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);

export function createFly({ getWallH = () => 3 } = {}) {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
  let path = null, t = 0, warned = false;
  const warnings = [];
  const top = new THREE.Vector3();

  // Where the path is at time s: position, look-at and fov, by key segment.
  function sample(s) {
    const k = path.keys, n = k.length;
    const T = k[n - 1].t;
    // One ease over the whole move, so it starts and lands without a jolt.
    const e = smoother(Math.min(1, Math.max(0, s / T))) * T;
    let i = 0;
    while (i < n - 2 && e > k[i + 1].t) i++;
    const a = k[Math.max(0, i - 1)], b = k[i], c = k[Math.min(n - 1, i + 1)], d = k[Math.min(n - 1, i + 2)];
    const u = c.t > b.t ? (e - b.t) / (c.t - b.t) : 0;
    const v = (f) => [0, 1, 2].map((j) => catmull(a[f][j], b[f][j], c[f][j], d[f][j], u));
    return { pos: v('pos'), look: v('look'), fov: b.fov + (c.fov - b.fov) * smoother(u) };
  }

  function step(dt) {
    if (!path) return false;
    t += dt;
    const s = sample(Math.min(t, path.keys[path.keys.length - 1].t));
    camera.position.set(...s.pos);
    camera.up.copy(UP);
    camera.lookAt(...s.look);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    // The frame's top edge, as a direction: below the wall tops it must point down.
    const wallH = getWallH();
    top.set(0, Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), -1).applyQuaternion(camera.quaternion);
    if (camera.position.y < wallH + 0.3 && top.y > -0.02) {
      const w = { t: +t.toFixed(2), y: +camera.position.y.toFixed(2), topY: +top.y.toFixed(3) };
      warnings.push(w);
      if (!warned) { warned = true; console.warn(`[fly] the frame's top edge rises above the wall tops at ${w.t}s (camera at ${w.y} m): the missing ceiling can show`); }
    }
    return true;
  }

  return {
    camera,
    set(p) { path = p?.keys?.length >= 2 ? { ...p, keys: [...p.keys].sort((x, y) => x.t - y.t) } : null; t = 0; warned = false; warnings.length = 0; if (path) step(0); },
    clear() { path = null; },
    step,
    get active() { return !!path; },
    get path() { return path; },
    get t() { return t; },
    get warnings() { return warnings; },
  };
}
