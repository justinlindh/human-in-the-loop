// Two-step confirm state: the first tap arms, the next tap confirms. Arming holds for `holdMs`, long
// enough to read the prompt and tap again, and ends early on a tap elsewhere (`outsideOf`) or `cancel`.
export const CONFIRM_HOLD_MS = 10000;

export function confirmGate({ holdMs = CONFIRM_HOLD_MS, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, outsideOf = null, doc = globalThis.document } = {}) {
  let timer = null;
  let armed = false;
  // While armed, a pointer landing outside `outsideOf` disarms. The listener exists only while armed.
  const onDown = (e) => { if (!outsideOf.contains(e.target)) cancel(); };
  const set = (v) => {
    if (armed === v) return;
    armed = v;
    if (outsideOf && doc) doc[v ? 'addEventListener' : 'removeEventListener']('pointerdown', onDown, true);
    onChange(v);
  };
  function cancel() {
    if (timer != null) clearTimer(timer);
    timer = null;
    set(false);
  }
  return {
    get armed() { return armed; },
    // Returns true when this tap is the confirming one.
    tap() {
      if (armed) { cancel(); return true; }
      set(true);
      timer = setTimer(() => { timer = null; set(false); }, holdMs);
      return false;
    },
    cancel,
  };
}
