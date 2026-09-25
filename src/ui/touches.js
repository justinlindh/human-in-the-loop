// Counts active touch pointers so single-finger gestures (a tap, a long-press) can stand down when
// a second finger lands (a pinch). multiTouch() stays true from the second finger until the next
// gesture starts, so a finger lifting at the end of a pinch is not taken for a tap.
const active = new Set();
let multi = false;
if (typeof addEventListener === 'function') {
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (!active.size) multi = false;
    active.add(e.pointerId);
    if (active.size > 1) multi = true;
  }, true);
  const lift = (e) => { if (e.pointerType === 'touch') active.delete(e.pointerId); };
  addEventListener('pointerup', lift, true);
  addEventListener('pointercancel', lift, true);
}
export const multiTouch = () => multi;
export const touchCount = () => active.size;
