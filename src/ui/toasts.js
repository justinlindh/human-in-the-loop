import { h } from './dom.js';
import { icon } from './icons.js';

const MAX_VISIBLE = 5;
const LIFE = { info: 4000, good: 4000, warn: 7000, bad: 7000 };

// Toasts stack top-right when no panel is open. While a panel is open they show one at a
// time in a strip reserved at the bottom of the panel, so they never cover its controls.
export function createToasts(root) {
  const el = h('div.toasts', { 'aria-live': 'polite' });
  root.append(el);
  let live = [];
  let dock = null;
  let lastText = '';
  let lastAt = 0;

  const toneOf = (t) => (LIFE[t] ? t : 'info');

  function node(t, cls) {
    return h(`div.${cls}.${t.tone}`, { onclick: () => remove(t) },
      h('span.ico', null, icon(`toast.${t.tone}`)), h('span.tt', { text: t.text }));
  }

  function renderDock() {
    if (!dock) return;
    const newest = live[live.length - 1];
    if (!newest) { dock.replaceChildren(h('span.dockidle')); return; }
    if (dock.firstChild?.dataset?.tid === String(newest.id)) return;
    const n = node(newest, 'dtoast');
    n.dataset.tid = String(newest.id);
    dock.replaceChildren(n);
  }

  function remove(t) {
    const i = live.indexOf(t);
    if (i < 0) return;
    live.splice(i, 1);
    clearTimeout(t.timer);
    if (t.node) {
      const n = t.node;
      t.node = null;
      n.classList.add('out');
      setTimeout(() => n.remove(), 230);
    }
    renderDock();
  }

  let seq = 0;
  function push(text, tone = 'info') {
    if (!text) return;
    const now = performance.now();
    if (text === lastText && now - lastAt < 800) return;
    lastText = text;
    lastAt = now;
    const t = { id: ++seq, text, tone: toneOf(tone), timer: 0, node: null };
    live.push(t);
    t.timer = setTimeout(() => remove(t), LIFE[t.tone]);
    if (dock) renderDock();
    else { t.node = node(t, 'toast'); el.append(t.node); }
    while (live.length > MAX_VISIBLE) remove(live[0]);
  }

  // Pass a panel's strip element to dock there, or null to go back to the corner stack.
  function setDock(d) {
    dock = d;
    for (const t of live) if (t.node) { t.node.remove(); t.node = null; }
    if (dock) renderDock();
    else for (const t of live) { t.node = node(t, 'toast'); el.append(t.node); }
  }

  return { push, setDock, el };
}
