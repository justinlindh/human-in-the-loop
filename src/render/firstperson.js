import * as THREE from 'three';

// First-person views: a perspective camera the renderer draws through instead of the isometric rig.
//
// createFirstPerson({ getOffice, getStaff, onAutoExit }) -> {
//   camera, mode, seeAs(staffId) -> bool, walk(spawn?) -> bool, exit(), input({ moveX, moveZ, yaw, pitch }), step(dt) -> bool }
//   input: moveX/moveZ -1..1 along the view's right and forward; yaw and pitch are radians turned since
//     the last call, positive yaw turning right and positive pitch looking up.
//   seeAs: the camera sits just in front of a person's eyes and looks where their head looks (down
//     their path while they walk); input is ignored. tooClose() lists who to leave out of the draw.
//   walk: the camera stands at a person's eye height, moved and turned by input, and slides along
//     walls, furniture and people instead of passing through them.
//   step(dt) moves the camera for this frame; it returns whether first person is on. It ends the mode
//   by itself when the person seen through is gone or the building changes, and then calls onAutoExit.

const FOV = 70;
const NEAR = 0.04;
const EYE_Y = 0.82;              // walk mode's eye height: a standing person's, as their probe measures it
const AHEAD_M = 0.07;            // see-as: the camera sits this far in front of the eyes, clear of the face
const BODY_R = 0.2;              // walk mode's body radius against furniture and walls
const PERSON_R = 0.22;           // and against people
const WALK_SPEED = 1.6;          // m/s at full input
const PITCH_MAX = 1.05;          // radians up or down
const FOLLOW = 18;               // how fast see-as follows the eyes (1/s): steady through a walk's bob
const LOOK_AHEAD_M = 1.2;        // see-as, walking: the view aims at the path this far ahead
const TURN = 6;                  // how fast see-as turns to a new heading (1/s)

// See-as leaves out of the frame anyone this close to the eye: a chibi head nearer than about 0.9 m
// covers a third of the view. Walking past or behind someone the wider reach applies; standing (a
// chat, a huddle) only the near one, so a conversation partner stays in view. Someone left out
// comes back only past the reach plus CLEAR_HOLD_M, so nobody blinks in and out.
const CLEAR_M = 0.5;
const CLEAR_WALK_M = 0.9;
const CLEAR_HOLD_M = 0.15;
const ARRIVE_M = 1.5;           // see-as: over a walk's last this-many metres the view turns to the spot's facing
const AT_SPOT_M = 0.5;           // and within this of the spot it holds that facing

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function pathLength(from, path) {
  let n = 0, at = from;
  for (const q of path ?? []) { n += Math.hypot(q.x - at.x, q.z - at.z); at = q; }
  return n;
}

// The point LOOK_AHEAD_M along a walk path from `from`, or null when the path is shorter than a
// step (standing, or arriving).
function pathAhead(from, path) {
  if (!path?.length) return null;
  let left = LOOK_AHEAD_M, at = from;
  for (const q of path) {
    const d = Math.hypot(q.x - at.x, q.z - at.z);
    if (d >= left) return { x: at.x + (q.x - at.x) * (left / d), z: at.z + (q.z - at.z) * (left / d) };
    left -= d;
    at = q;
  }
  return left < LOOK_AHEAD_M - 0.3 ? at : null;
}
const STEP_M = 0.05;             // walk moves in sub-steps no longer than this, so it never tunnels

export function createFirstPerson({ getOffice, getStaff, onAutoExit = () => {} }) {
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, NEAR, 200);
  let mode = 'off';
  let who = null, stage = null;
  const walker = { x: 0, z: 0, yaw: 0, pitch: 0 };
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const view = { yaw: 0 };
  let fresh = true;
  let walking = false;            // see-as: the person has a path ahead this frame
  const left = new Set();         // see-as: characters left out of the last frame

  function shown(id) {
    const s = getStaff();
    return !!s?.charOf(id) && !!s.shown?.(id);
  }

  function blocked(x, z) {
    const office = getOffice(), L = office?.current?.L;
    if (!L) return true;
    if (Math.abs(x) > L.W / 2 - BODY_R || Math.abs(z) > L.D / 2 - BODY_R) return true;
    for (const o of office.obstacles()) if (x > o.x0 - BODY_R && x < o.x1 + BODY_R && z > o.z0 - BODY_R && z < o.z1 + BODY_R) return true;
    for (const p of getStaff()?.positions() ?? []) if (Math.hypot(p.x - x, p.z - z) < PERSON_R + BODY_R) return true;
    return false;
  }

  // A clear point near (x, z): the point itself, else the nearest on rings round it.
  function clearNear(x, z) {
    if (!blocked(x, z)) return { x, z };
    for (let r = 0.25; r <= 3; r += 0.25) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (!blocked(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  function begin(m) {
    mode = m;
    stage = getOffice()?.current ?? null;
    fresh = true;
  }

  function end(auto) {
    if (mode === 'off') return;
    mode = 'off';
    who = null;
    if (auto) onAutoExit();
  }

  function seeAs(id) {
    if (!shown(id)) return false;
    begin('seeAs');
    who = id;
    return true;
  }

  // spawn: { x, z, yaw } in world; by default just inside the door, facing into the room.
  function walk(spawn = null) {
    const office = getOffice(), L = office?.current?.L;
    if (!L) return false;
    let s = spawn;
    if (!s) {
      const d = office.current.zones?.door ?? { x: 0, z: L.D / 2 - 0.5 };
      s = { x: d.x, z: d.z, yaw: Math.atan2(-d.x, -d.z) };
    }
    const at = clearNear(s.x, s.z);
    if (!at) return false;
    begin('walk');
    Object.assign(walker, { x: at.x, z: at.z, yaw: s.yaw ?? 0, pitch: 0 });
    return true;
  }

  function input({ moveX = 0, moveZ = 0, yaw = 0, pitch = 0 } = {}) {
    if (mode !== 'walk') return;
    walker.yaw -= yaw;
    walker.pitch = THREE.MathUtils.clamp(walker.pitch + pitch, -PITCH_MAX, PITCH_MAX);
    walker.move = { x: THREE.MathUtils.clamp(moveX, -1, 1), z: THREE.MathUtils.clamp(moveZ, -1, 1) };
  }

  // Moves the walker by (dx, dz), sliding along whatever stops one axis.
  function slide(dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / STEP_M));
    for (let i = 0; i < n; i++) {
      const sx = dx / n, sz = dz / n;
      if (!blocked(walker.x + sx, walker.z + sz)) { walker.x += sx; walker.z += sz; continue; }
      if (!blocked(walker.x + sx, walker.z)) walker.x += sx;
      else if (!blocked(walker.x, walker.z + sz)) walker.z += sz;
    }
  }

  function aim(yaw, pitch) {
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.up.set(0, 1, 0);
    camera.lookAt(tmp.copy(camera.position).add(dir));
  }

  function step(dt) {
    if (mode === 'off') return false;
    if (getOffice()?.current !== stage) { end(true); return false; }
    if (mode === 'seeAs') {
      if (!shown(who)) { end(true); return false; }
      const p = getStaff().charOf(who).probe();
      // Walking, the view looks down the path a little ahead rather than where the head points at
      // this instant, so a turn round a corner doesn't fill the screen with the wall it passes.
      // Near the end of a walk it turns to face what they are walking to (a spot's facing), not the
      // wall the last steps point at.
      const w = getStaff().walkOf?.(who);
      const ahead = pathAhead(p.eyes, w?.path);
      walking = !!w?.path?.length;
      let want = ahead ? Math.atan2(ahead.x - p.eyes.x, ahead.z - p.eyes.z) : Math.atan2(p.forward.x, p.forward.z);
      // At the spot it holds that facing while the body turns round to it.
      const spot = w?.temp?.goal ?? w?.goal;
      const left = pathLength(p.eyes, w?.path);
      if (spot?.yaw != null) {
        if (ahead && left < ARRIVE_M) want += wrap(spot.yaw - want) * (1 - left / ARRIVE_M);
        else if (!ahead && Math.hypot(spot.x - p.eyes.x, spot.z - p.eyes.z) < AT_SPOT_M) want = spot.yaw;
      }
      const pitch = Math.asin(THREE.MathUtils.clamp(p.forward.y, -1, 1));
      view.yaw = fresh ? want : view.yaw + wrap(want - view.yaw) * (1 - Math.exp(-dt * TURN));
      pos.copy(p.eyes).addScaledVector(tmp.set(Math.sin(view.yaw), 0, Math.cos(view.yaw)), AHEAD_M);
      if (fresh) camera.position.copy(pos);
      else camera.position.lerp(pos, 1 - Math.exp(-dt * FOLLOW));
      aim(view.yaw, pitch);
    } else {
      const m = walker.move;
      if (m && (m.x || m.z)) {
        const f = WALK_SPEED * dt;
        const fx = Math.sin(walker.yaw), fz = Math.cos(walker.yaw);
        // Right of the view is forward turned a quarter clockwise seen from above.
        slide((fx * m.z - fz * m.x) * f, (fz * m.z + fx * m.x) * f);
      }
      walker.move = null;
      camera.position.set(walker.x, EYE_Y, walker.z);
      aim(walker.yaw, walker.pitch);
    }
    fresh = false;
    camera.updateMatrixWorld();
    return true;
  }

  return {
    camera, seeAs, walk, input, step,
    // See-as: the characters not to draw this frame: the person seen through, and anyone too close to
    // the eye (a passer-by's head would fill the screen). Walk mode keeps everyone: people stop the
    // walker a body apart, and it chose to go there.
    tooClose() {
      if (mode !== 'seeAs') { left.clear(); return []; }
      const reach = walking ? CLEAR_WALK_M : CLEAR_M;
      const near = getStaff()?.charsNear?.(camera.position.x, camera.position.z, reach + CLEAR_HOLD_M, who) ?? [];
      const out = near.filter((n) => n.d < reach || left.has(n.char)).map((n) => n.char);
      left.clear();
      for (const c of out) left.add(c);
      // Their own body too: a hand swinging up into the view reads as a ball floating past.
      const self = getStaff()?.charOf(who);
      return self ? [self, ...out] : out;
    },
    exit() { end(false); },
    get mode() { return mode; },
    get who() { return who; },
    get walker() { return { ...walker }; },
  };
}
