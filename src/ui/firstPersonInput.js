// Pure input maths for the first-person views: keys, a virtual stick and drag-look become the numbers the
// renderer's firstPerson.input() takes. Move axes are -1..1 (x right, z forward); look deltas are radians
// (yaw > 0 turns right, pitch > 0 looks up).

export const LOOK_MOUSE = 0.0025;
export const LOOK_TOUCH = 0.006;
export const STICK_DEAD = 0.15;

const norm = (x, z) => {
  const m = Math.hypot(x, z);
  return m > 1 ? { x: x / m, z: z / m } : { x, z };
};

// Held keys (KeyboardEvent.code values) to a move vector; opposite keys cancel.
export function keyAxes(down) {
  const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
  const z = (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0);
  return norm(x, z);
}

// The stick's thumb offset in pixels (screen down is positive y) to a move vector. Inside the dead zone it is zero.
export function stickAxes(dx, dy, radius) {
  const m = Math.hypot(dx, dy) / radius;
  if (m < STICK_DEAD) return { x: 0, z: 0 };
  const k = Math.min(1, m) / m;
  return { x: (dx / radius) * k, z: (-dy / radius) * k };
}

export const lookDelta = (dx, dy, sens) => ({ yaw: dx * sens, pitch: -dy * sens });

// Two sources of movement add and clamp, so a stick and a key never exceed full speed.
export const combine = (a, b) => norm(a.x + b.x, a.z + b.z);
