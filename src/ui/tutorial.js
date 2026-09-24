import { h, setText } from './dom.js';

const KEY = 'hitl.tutorialDone';

const STEPS = [
  { target: '.topbar', place: 'below', title: 'Your company at a glance',
    text: 'Cash and runway, monthly revenue, your team, and three things to watch: Brand, Know-how, and Comprehension Debt. Hover anything for details.' },
  { target: '.chip.speed', place: 'below-left', title: 'Time',
    text: 'Space pauses. 1, 2, and 3 set the speed. The game waits for you whenever there is a decision to make.' },
];

export function tutorialDone() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function markDone() {
  try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable: the tutorial just shows again next time */ }
}

// Dismissible coach marks for the HUD and the speed controls.
export function createTutorial({ layer, sfx, controls, ui }) {
  let resume = null; // speed to restore when the tips close
  const ring = h('div.coach-ring');
  const title = h('b');
  const text = h('p');
  const count = h('span.small.muted');
  const next = h('button.btn.go.small', { onclick: () => go(i + 1) }, 'Next');
  const bubble = h('div.coach', null, title, text, h('div.row', null, count, h('span.spacer'),
    h('button.btn.small', { onclick: () => finish() }, 'Skip'), next));
  const root = h('div.coach-layer', null, ring, bubble);
  root.style.display = 'none';
  layer.append(root);
  let i = -1;

  function place() {
    if (i < 0) return;
    const step = STEPS[i];
    const t = layer.querySelector(step.target);
    const box = layer.getBoundingClientRect();
    if (!t) return;
    const r = t.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - box.left - pad}px`, top: `${r.top - box.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    let x = r.left - box.left + r.width / 2 - bw / 2;
    let y = step.place.startsWith('below') ? r.bottom - box.top + 16 : r.top - box.top - bh - 16;
    if (step.place === 'below-left') x = r.right - box.left - bw;
    if (step.place === 'left') { x = r.left - box.left - bw - 16; y = r.top - box.top; }
    x = Math.max(12, Math.min(box.width - bw - 12, x));
    y = Math.max(12, Math.min(box.height - bh - 12, y));
    Object.assign(bubble.style, { left: `${x}px`, top: `${y}px` });
  }

  function go(n) {
    if (i >= 0) STEPS[i].leave?.(ui);
    if (n >= STEPS.length) { finish(); return; }
    if (i < 0 && resume === null) { resume = controls?.getSpeed?.() ?? 1; controls?.setSpeed?.(0); }
    i = n;
    const step = STEPS[i];
    setText(title, step.title);
    setText(text, step.text);
    setText(count, `${i + 1} of ${STEPS.length}`);
    setText(next, i === STEPS.length - 1 ? 'Got it' : 'Next');
    root.style.display = '';
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    step.enter?.(ui);
    place();
    requestAnimationFrame(place);
    sfx('blip');
  }

  function finish() {
    if (i >= 0) STEPS[i].leave?.(ui);
    root.style.display = 'none';
    i = -1;
    if (resume !== null && (controls?.getSpeed?.() ?? 0) === 0) controls?.setSpeed?.(resume);
    resume = null;
    markDone();
  }

  addEventListener('resize', () => { if (i >= 0) place(); });

  return {
    start(force = false, resumeSpeed = null) {
      if (!force && tutorialDone()) return;
      if (resumeSpeed !== null && resume === null) resume = resumeSpeed;
      go(0);
    },
    get open() { return i >= 0; },
    onKey(e) {
      if (i < 0) return false;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); return true; }
      if (e.key === 'Escape') { e.preventDefault(); finish(); return true; }
      return false;
    },
  };
}
