// Game-styled tooltips for the whole UI layer, in place of the browser's native title bubbles.
// Any element with data-tip gets one: after a short hover or keyboard focus, or a long-press on
// touch. A tip with line breaks shows its first line in bold. The tooltip flips and shifts to stay
// on screen, never covers its element, and is linked to it with aria-describedby while shown.
// h() turns a `title` prop into data-tip; setTip() does the same for an element made elsewhere.
import { h } from './dom.js';

const SHOW_MS = 300;       // hover or focus delay
const LONG_MS = 450;       // touch long-press
const MOVE_PX = 10;        // a press that moves further is a scroll, not a long-press
const GAP = 10;            // between the element and the tooltip
const EDGE = 8;            // from the screen edge

export function setTip(el, text) {
  if (!el) return;
  if (text) el.dataset.tip = text; else delete el.dataset.tip;
}

export function createTooltips(layer) {
  const body = h('div.gtip-body');
  const arrow = h('div.gtip-arrow');
  const tip = h('div.gtip', { role: 'tooltip', id: 'hitl-tip', dataset: { occludes: '' } }, body, arrow);
  tip.style.display = 'none';
  layer.append(tip);

  let target = null, shownText = '', by = null;
  let timer = 0, raf = 0;
  let press = null;          // { el, x, y, timer } during a touch press
  let eatClick = false;      // the release after a long-press is not a click

  const find = (node) => {
    const el = node?.closest?.('[data-tip]');
    return el && el.dataset.tip && layer.contains(el) && el !== tip && !tip.contains(el) ? el : null;
  };

  function fill(text) {
    shownText = text;
    const lines = text.split('\n');
    body.replaceChildren(...(lines.length > 1
      ? [h('b.gtip-title', { text: lines[0] }), ...lines.slice(1).filter(Boolean).map((l) => h('div.gtip-line', { text: l }))]
      : [h('div.gtip-line', { text })]));
  }

  function place() {
    if (!target) return;
    if (!target.isConnected || !target.dataset.tip || target.getClientRects().length === 0) { hide(); return; }
    if (target.dataset.tip !== shownText) fill(target.dataset.tip);
    const box = layer.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    // Above by default; below when there is no room above.
    const above = r.top - box.top - GAP - th >= EDGE;
    const y = above ? r.top - box.top - GAP - th : r.bottom - box.top + GAP;
    const cx = r.left - box.left + r.width / 2;
    const x = Math.max(EDGE, Math.min(box.width - tw - EDGE, cx - tw / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.toggle('below', !above);
    arrow.style.left = `${Math.max(12, Math.min(tw - 12, cx - x))}px`;
    raf = requestAnimationFrame(place);
  }

  function show(el, how) {
    clearTimeout(timer);
    if (target && target !== el) hide();
    target = el;
    by = how;
    fill(el.dataset.tip);
    tip.style.display = '';
    const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (!ids.includes(tip.id)) el.setAttribute('aria-describedby', [...ids, tip.id].join(' '));
    cancelAnimationFrame(raf);
    place();
  }

  function hide() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    if (target) {
      const ids = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== tip.id);
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby');
    }
    target = null;
    by = null;
    tip.style.display = 'none';
  }

  function later(el, how) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (el.isConnected) show(el, how); }, SHOW_MS);
  }

  // Mouse and pen: hover.
  layer.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = find(e.target);
    if (el === target) return;
    if (target && by !== 'focus') hide();
    clearTimeout(timer);
    if (el) later(el, 'hover');
  });
  layer.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const el = find(e.target);
    if (!el || el.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    if (target === el && by === 'hover') hide();
  });

  // Keyboard: focus.
  layer.addEventListener('focusin', (e) => {
    const el = find(e.target);
    if (el && e.target.matches?.(':focus-visible')) later(el, 'focus');
  });
  layer.addEventListener('focusout', (e) => {
    const el = find(e.target);
    if (el && target === el && by === 'focus') hide();
    clearTimeout(timer);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && target) hide(); }, true);

  // Touch: a long-press shows the tip; a tap anywhere else dismisses it.
  layer.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (target && by === 'hover' && !target.contains(e.target)) hide(); return; }
    eatClick = false;
    const el = find(e.target);
    if (target && el !== target) hide();
    clearTimeout(press?.timer);
    press = el ? { el, x: e.clientX, y: e.clientY, timer: setTimeout(() => { show(el, 'touch'); eatClick = true; }, LONG_MS) } : null;
  }, true);
  const endPress = () => { clearTimeout(press?.timer); press = null; };
  layer.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) endPress();
  }, true);
  layer.addEventListener('pointerup', endPress, true);
  layer.addEventListener('pointercancel', endPress, true);
  layer.addEventListener('click', (e) => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  layer.addEventListener('contextmenu', (e) => { if (press || by === 'touch') e.preventDefault(); }, true);
  addEventListener('wheel', () => { if (target && by === 'hover') hide(); }, { passive: true });

  return { hide, get open() { return !!target; }, show };
}
