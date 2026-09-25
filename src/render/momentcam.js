// The moment camera: while a staged moment plays, the camera eases onto it (following it if it
// moves) and zooms in a little, then eases back to where the player had it. It keeps its hands off
// whenever the player has steered the camera recently, lets go for good once they steer during the
// moment, and does nothing with the player's "Moment camera" setting off (hitl:cameraSettings).
//
// createMomentCamera(rig) -> { hold(key, target, { zoom }), release(key), update(dt), enabled }
//   target: a { x, z } point, an Object3D, or a function returning either.

const HANDS_OFF_MS = 4000;   // the player steered this recently: leave the camera alone
const FOLLOW_RATE = 1.6;     // how quickly the camera eases toward the moment (rig.focus rate)

let enabled = true;
if (typeof window !== 'undefined') {
  addEventListener('hitl:cameraSettings', (e) => { enabled = e.detail?.momentCamera !== false; });
}

export function createMomentCamera(rig) {
  let held = null;   // { key, target, zoom, from: { goal, zoom }, at }
  const now = () => performance.now();
  const point = (t) => {
    const v = typeof t === 'function' ? t() : t;
    if (!v) return null;
    return v.isObject3D ? { x: v.position.x, z: v.position.z } : v;
  };

  function hold(key, target, { zoom = 1.8 } = {}) {
    if (!rig || !enabled || now() - rig.lastInput < HANDS_OFF_MS) return false;
    // A new moment takes over from one already held, but the way back stays the player's view.
    const from = held?.from ?? { goal: rig.goal, zoom: rig.zoomGoal };
    held = { key, target, zoom: Math.max(zoom, from.zoom), from, at: now() };
    return true;
  }

  function release(key) {
    if (!held || held.key !== key) return;
    // Back to the player's view, unless they took the camera during the moment.
    if (rig.lastInput < held.at && enabled) rig.focus(held.from.goal, held.from.zoom, FOLLOW_RATE);
    held = null;
  }

  function update() {
    if (!held) return;
    if (!enabled || rig.lastInput >= held.at) { held = null; return; }
    const p = point(held.target);
    if (p) rig.focus({ x: p.x, y: 0.6, z: p.z }, held.zoom, FOLLOW_RATE);
  }

  return { hold, release, update, get held() { return held?.key ?? null; }, get enabled() { return enabled; } };
}
