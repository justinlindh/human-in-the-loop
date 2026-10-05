// Who turns to look at someone, and how far. No three.js here.
const KEEP = new Set(['facepalm', 'facepalmsit', 'lie', 'nap', 'sprawl']);

// The yaw `a` turns to while looking at `b`, or null when `a` keeps facing as they are: a facepalmer
// keeps their camera-facing turn, and anyone lying would spin on the couch or pod. A seated person
// (at a desk, or in a meeting chair) swivels at most `swivel` radians either way from the seat.
export function lookYaw(a, b, swivel) {
  if (KEEP.has(a.char.anim)) return null;
  let yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  const seat = a.temp?.seat ? a.temp.goal : a.goal?.seated && !a.path.length && !a.temp ? a.goal : null;
  if (seat) {
    let d = ((yaw - seat.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    yaw = seat.yaw + Math.max(-swivel, Math.min(swivel, d));
  }
  return yaw;
}
