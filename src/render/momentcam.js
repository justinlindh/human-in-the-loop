// The moment camera: while a staged moment plays, the camera glides onto it (following it if it
// moves) and zooms in a little, then glides back to where the player had it. It keeps its hands off
// whenever the player has steered the camera recently, lets go for good once they steer during the
// moment, and does nothing with the player's "Moment camera" setting off (hitl:cameraSettings).
//
// createMomentCamera(rig) -> { hold(key, target, { zoom }), release(key), update(dt), enabled }
//   target: a { x, z } point, an Object3D, or a function returning either.
//
// The glide is a critically damped spring on the point the camera looks at: it starts from rest,
// speeds up and settles without overshoot, so neither the start nor the end of a moment jolts. The
// rig then follows that point closely.

const HANDS_OFF_MS = 4000;   // the player steered this recently: leave the camera alone
const GLIDE_S = 0.7;         // the spring's smoothing time: about how long a glide takes to settle
const RIG_RATE = 12;         // how closely the rig tracks the gliding point (rig.focus rate)

let enabled = true;
if (typeof window !== 'undefined') {
  addEventListener('hitl:cameraSettings', (e) => { enabled = e.detail?.momentCamera !== false; });
}

// One step of a critically damped spring from x toward goal (Game Programming Gems 4, SmoothDamp).
function damp(x, v, goal, dt) {
  const w = 2 / GLIDE_S, k = w * dt;
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const d = x - goal, t = (v + w * d) * dt;
  return [goal + (d + t) * e, (v - w * t) * e];
}

export function createMomentCamera(rig) {
  let held = null;   // { key, target, zoom, from: { goal, zoom }, at }
  let back = null;   // gliding back to the player's view: { goal, zoom }
  let glide = null;  // the gliding look point: { x, y, z, vx, vy, vz, zoom, vzoom }
  const now = () => performance.now();
  const point = (t) => {
    const v = typeof t === 'function' ? t() : t;
    if (!v) return null;
    return v.isObject3D ? { x: v.position.x, z: v.position.z } : v;
  };
  // The glide starts where the camera looks now, not where it was headed, so it never lurches.
  const start = () => { const t = rig.target ?? rig.goal; return { x: t.x, y: t.y ?? 0.6, z: t.z, vx: 0, vy: 0, vz: 0, zoom: rig.zoom ?? rig.zoomGoal, vzoom: 0 }; };

  function hold(key, target, { zoom = 1.8 } = {}) {
    if (!rig || !enabled || now() - rig.lastInput < HANDS_OFF_MS) return false;
    // A new moment takes over from one already held, but the way back stays the player's view.
    const from = held?.from ?? back ?? { goal: rig.goal, zoom: rig.zoomGoal };
    held = { key, target, zoom: Math.max(zoom, from.zoom), from, at: now() };
    back = null;
    glide ??= start();
    return true;
  }

  function release(key) {
    if (!held || held.key !== key) return;
    // Back to the player's view, unless they took the camera during the moment.
    if (rig.lastInput < held.at && enabled) back = { ...held.from, at: held.at };
    else glide = null;
    held = null;
  }

  function step(to, zoom, dt) {
    [glide.x, glide.vx] = damp(glide.x, glide.vx, to.x, dt);
    [glide.y, glide.vy] = damp(glide.y, glide.vy, to.y ?? 0.6, dt);
    [glide.z, glide.vz] = damp(glide.z, glide.vz, to.z, dt);
    [glide.zoom, glide.vzoom] = damp(glide.zoom, glide.vzoom, zoom, dt);
    rig.focus({ x: glide.x, y: glide.y, z: glide.z }, glide.zoom, RIG_RATE);
  }

  function update(dt = 1 / 60) {
    if (held) {
      if (!enabled || rig.lastInput >= held.at) { held = null; glide = null; return; }
      const p = point(held.target);
      if (p) step({ x: p.x, y: 0.6, z: p.z }, held.zoom, dt);
      return;
    }
    if (back) {
      if (!enabled || rig.lastInput >= back.at) { back = null; glide = null; return; }
      step(back.goal, back.zoom, dt);
      // Settled: the player's own view again, exactly.
      if (Math.hypot(glide.x - back.goal.x, glide.z - back.goal.z) < 0.01 && Math.abs(glide.vx) + Math.abs(glide.vz) < 0.01) {
        rig.focus(back.goal, back.zoom, RIG_RATE);
        back = null; glide = null;
      }
    }
  }

  return { hold, release, update, get held() { return held?.key ?? null; }, get enabled() { return enabled; } };
}
