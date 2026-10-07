// First-person views: "See as" (the camera rides a person's eyes) and "Walk" (you move through the office).
// The renderer owns the camera and collision (renderer.firstPerson); this owns every control:
// WASD or arrows and pointer-lock mouse look on a desktop, a virtual stick (left) and drag-look (right half)
// on touch, and an Exit button always. The HUD is hidden while a mode is on, leaving only the exit button,
// who you are looking through, and the controls.
import { h } from './dom.js';
import { combine, keyAxes, lookDelta, LOOK_MOUSE, LOOK_TOUCH, stickAxes } from './firstPersonInput.js';

const STICK_R = 54;
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

export function createFirstPerson({ layer, controls, ctx, sfx }) {
  const R = () => controls.renderer ?? controls.getRenderer?.() ?? null;
  const fp = () => R()?.firstPerson ?? null;
  const available = () => !!fp();

  let mode = 'off';
  let raf = 0;
  const keys = new Set();
  let stick = { x: 0, z: 0 };
  let look = { yaw: 0, pitch: 0 };

  const who = h('div.fp-who');
  const exitBtn = h('button.btn.fp-exit', { type: 'button', 'aria-label': 'Leave first person view', onclick: () => exit() }, 'Exit');
  const hint = h('div.fp-hint');
  const knob = h('i');
  const stickEl = h('div.fp-stick', null, knob);
  const lookEl = h('div.fp-look');
  const touchLayer = h('div.fp-touch', null, stickEl, lookEl);
  const root = h('div.fp', { dataset: { occludes: '' } }, who, hint, exitBtn, touchLayer);
  root.hidden = true;
  layer.append(root);

  const walkBtn = h('button.btn.small.fp-walk', { type: 'button', title: 'Walk around the office', onclick: () => { if (walk()) sfx?.('open'); } }, 'Walk');
  walkBtn.hidden = true;
  layer.append(walkBtn);

  function setMode(next, label = '') {
    mode = next;
    root.hidden = next === 'off';
    layer.classList.toggle('fp-on', next !== 'off');
    layer.classList.toggle('fp-walking', next === 'walk');
    who.textContent = label;
    hint.textContent = next === 'walk' ? (matchMedia?.('(pointer: coarse)').matches ? 'Stick to move, drag to look' : 'WASD to move, mouse to look, Esc to leave') : '';
    if (next === 'off') { cancelAnimationFrame(raf); raf = 0; keys.clear(); stick = { x: 0, z: 0 }; look = { yaw: 0, pitch: 0 }; knob.style.transform = ''; releaseLock(); } else if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame() {
    raf = 0;
    if (mode === 'off') return;
    // The renderer can end a mode by itself (the person left): drop the controls with it.
    const m = fp()?.mode?.();
    if (m === 'off' || m === undefined) { setMode('off'); return; }
    if (mode === 'walk') {
      const mv = combine(keyAxes(keys), stick);
      fp().input?.({ moveX: mv.x, moveZ: mv.z, yaw: look.yaw, pitch: look.pitch });
      look = { yaw: 0, pitch: 0 };
    }
    raf = requestAnimationFrame(frame);
  }

  function seeAs(staffId, name = '') {
    if (!available() || mode !== 'off' && !exit()) return false;
    ctx.closeAll?.();
    if (!fp().seeAs(staffId)) { ctx.toast?.('They are not around to see through right now.', 'warn'); return false; }
    setMode('seeAs', name ? `Seeing as ${name}` : 'Seeing as someone');
    return true;
  }

  function walk() {
    if (!available()) return false;
    if (mode !== 'off') return true;
    ctx.closeAll?.();
    if (!fp().walk()) { ctx.toast?.('Cannot walk here right now.', 'warn'); return false; }
    setMode('walk', 'Walking');
    requestLock();
    return true;
  }

  function exit() {
    if (mode === 'off') return true;
    fp()?.exit?.();
    setMode('off');
    sfx?.('close');
    return true;
  }

  // Pointer lock (desktop only): a failed or refused lock leaves the keys working and the mouse inert.
  const mouse = () => !matchMedia?.('(pointer: coarse)').matches;
  function requestLock() { if (mouse()) try { layer.requestPointerLock?.()?.catch?.(() => {}); } catch { /* no lock: keys only */ } }
  function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock?.(); } catch { /* already free */ } }

  window.addEventListener('keydown', (e) => {
    if (mode === 'off' || TYPING.test(e.target?.tagName ?? '')) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); exit(); return; }
    if (mode !== 'walk') return;
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)) { keys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e) => { keys.delete(e.code); }, true);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (e) => {
    if (mode !== 'walk' || document.pointerLockElement !== layer) return;
    const l = lookDelta(e.movementX, e.movementY, LOOK_MOUSE);
    look.yaw += l.yaw; look.pitch += l.pitch;
  });
  // A click in the scene takes the lock back after it was released (for instance by the browser on Esc).
  layer.addEventListener('pointerdown', (e) => { if (mode === 'walk' && e.pointerType === 'mouse' && e.target === lookEl) requestLock(); });
  document.addEventListener('pointerlockchange', () => { if (mode === 'walk' && !document.pointerLockElement && mouse()) hint.textContent = 'Click to look around. Esc to leave'; });

  // Touch: the left half drives the stick from wherever the thumb lands, the right half looks.
  let stickId = null, stickOrigin = null, lookId = null, lookLast = null;
  touchLayer.addEventListener('pointerdown', (e) => {
    if (mode !== 'walk' || e.pointerType === 'mouse') return;
    e.preventDefault();
    const left = e.clientX < innerWidth / 2;
    if (left && stickId === null) {
      stickId = e.pointerId; stickOrigin = { x: e.clientX, y: e.clientY };
      const r = layer.getBoundingClientRect();
      stickEl.style.left = `${e.clientX - r.left - STICK_R}px`; stickEl.style.top = `${e.clientY - r.top - STICK_R}px`;
      stickEl.classList.add('on');
    } else if (!left && lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
    touchLayer.setPointerCapture?.(e.pointerId);
  });
  touchLayer.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId && stickOrigin) {
      const dx = e.clientX - stickOrigin.x, dy = e.clientY - stickOrigin.y;
      stick = stickAxes(dx, dy, STICK_R);
      knob.style.transform = `translate(${stick.x * STICK_R * 0.6}px, ${-stick.z * STICK_R * 0.6}px)`;
    } else if (e.pointerId === lookId && lookLast) {
      const l = lookDelta(e.clientX - lookLast.x, e.clientY - lookLast.y, LOOK_TOUCH);
      look.yaw += l.yaw; look.pitch += l.pitch; lookLast = { x: e.clientX, y: e.clientY };
    }
  });
  const end = (e) => {
    if (e.pointerId === stickId) { stickId = null; stickOrigin = null; stick = { x: 0, z: 0 }; knob.style.transform = ''; stickEl.classList.remove('on'); }
    if (e.pointerId === lookId) { lookId = null; lookLast = null; }
  };
  touchLayer.addEventListener('pointerup', end);
  touchLayer.addEventListener('pointercancel', end);
  window.addEventListener('hitl:firstPerson', (e) => { if (e.detail?.mode === 'off' && mode !== 'off') setMode('off'); });

  return {
    seeAs, walk, exit,
    get active() { return mode !== 'off'; },
    get mode() { return mode; },
    available,
    // Cheap per frame: the Walk button follows the renderer's offer and hides under panels and other modes.
    update(covered = false) {
      const on = available() && mode === 'off' && !covered;
      if (walkBtn.hidden === on) walkBtn.hidden = !on;
    },
  };
}
