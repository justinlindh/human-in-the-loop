import { h, setText } from './dom.js';

const KEY = 'hitl.tutorialDone';

const STEPS = [
  { target: '.topbar', place: 'below', title: 'Your company at a glance',
    text: 'Cash and runway, monthly revenue, your team, and three things to watch: Brand, Know-how, and Comprehension Debt. Tap or hover any of them for details.' },
  { target: '.tray', place: 'right', title: 'What needs you',
    text: 'Anything waiting on you shows up here first, then your goals. Tap a line to jump to it. Each goal pays a small reward.' },
  { target: '.mbtn[data-menu="build"]', place: 'above', title: 'Build a product',
    text: 'Start here. Pick a category and an angle, choose who builds it, and ship. Launches bring customers, and customers bring revenue.' },
  { target: '.mbtn[data-menu="staff"]', place: 'above', title: 'Your people',
    text: 'Hire, assign work, and watch how people feel. Tired people slow down, and burnt-out people leave.' },
  { target: '.mbtn[data-menu="office"]', place: 'above', title: 'The office',
    text: 'Everyone needs a desk. Place furniture here, and move somewhere bigger as the company grows.' },
  { target: '.chat', place: 'right', title: 'Slackk',
    text: 'The team talks here. It is the quickest way to hear that something is going wrong.' },
  { target: '.chip.speed', place: 'below-left', title: 'Time',
    text: 'Pause and speed live here (Space, 1, 2, and 3 on a keyboard). The game waits for you whenever there is a decision to make.' },
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
    h('button.btn.small', { onclick: () => finish() }, 'Skip tour'), next));
  const root = h('div.coach-layer', null, ring, bubble);
  root.style.display = 'none';
  layer.append(root);
  let i = -1;
  // Held while a menu, modal, or card is open: the coach marks hide and a pending start waits.
  let held = false;
  let pending = null;

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
    if (step.place === 'right') { x = r.right - box.left + 16; y = r.top - box.top; }
    if (step.place === 'above') y = r.top - box.top - bh - 16;
    x = Math.max(12, Math.min(box.width - bw - 12, x));
    y = Math.max(12, Math.min(box.height - bh - 12, y));
    Object.assign(bubble.style, { left: `${x}px`, top: `${y}px` });
  }

  const visible = (sel) => { const t = layer.querySelector(sel); return !!t && t.getClientRects().length > 0; };

  function go(n) {
    if (i >= 0) STEPS[i].leave?.(ui);
    // Steps whose target is not on screen yet (a menu still locked) are skipped.
    while (n < STEPS.length && !visible(STEPS[n].target)) n++;
    if (n >= STEPS.length) { finish(); return; }
    if (i < 0 && resume === null) { resume = controls?.getSpeed?.() ?? 1; controls?.setSpeed?.(0); }
    i = n;
    const step = STEPS[i];
    setText(title, step.title);
    setText(text, step.text);
    setText(count, `${i + 1} of ${STEPS.length}`);
    setText(next, i === STEPS.length - 1 ? 'Got it' : 'Next');
    root.style.display = held ? 'none' : '';
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
      if (held) { pending = { force, resumeSpeed }; return; }
      if (!force && tutorialDone()) return;
      if (resumeSpeed !== null && resume === null) resume = resumeSpeed;
      go(0);
    },
    get open() { return i >= 0; },
    setHeld(on) {
      if (on === held) return;
      held = on;
      if (i >= 0) { root.style.display = held ? 'none' : ''; if (!held) { place(); requestAnimationFrame(place); } }
      if (!held && pending) { const p = pending; pending = null; this.start(p.force, p.resumeSpeed); }
    },
    onKey(e) {
      if (i < 0 || held) return false;
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); return true; }
      if (e.key === 'Escape') { e.preventDefault(); finish(); return true; }
      return false;
    },
  };
}
