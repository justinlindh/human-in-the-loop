import { h } from './dom.js';
import { icon } from './icons.js';

const MAX_VISIBLE = 5;
const LIFE = { info: 6500, good: 6500, warn: 9000, bad: 9000 };
// Toasts shown per game week before the rest collapse into a "+N more" chip. Warn and bad always show.
const WEEK_BUDGET = 3;

// Toasts stack top-right when no panel is open. While a panel is open they show one at a
// time in a strip reserved at the bottom of the panel, so they never cover its controls.
export function createToasts(root) {
  const el = h('div.toasts', { 'aria-live': 'polite' });
  root.append(el);
  let live = [];
  let dock = null;
  let lastText = '';
  let lastAt = 0;
  let week = null;
  let shownThisWeek = 0;
  let held = [];
  const moreChip = h('button.toast-more', { onclick: () => release() });
  moreChip.style.display = 'none';
  el.append(moreChip);


  const toneOf = (t) => (LIFE[t] ? t : 'info');

  function node(t, cls, more = 0) {
    return h(`div.${cls}.${t.tone}${t.action ? '.clickable' : ''}`, { onclick: () => { t.action?.(); remove(t); } },
      h('span.ico', null, icon(`toast.${t.tone}`)), h('span.tt', { text: t.text }),
      more > 0 ? h('span.more.num', { title: `${more} more`, text: `+${more}` }) : null);
  }

  // The dock shows the most severe live toast (newest among equals) and how many others wait.
  const RANK = { bad: 3, warn: 2, good: 1, info: 0 };
  function renderDock() {
    if (!dock) return;
    if (!live.length) { dock.replaceChildren(h('span.dockidle')); return; }
    let top = live[0];
    for (const t of live) if (RANK[t.tone] >= RANK[top.tone]) top = t;
    const key = `${top.id}:${live.length}:${held.length}`;
    if (dock.firstChild?.dataset?.key === key) return;
    const n = node(top, 'dtoast', live.length - 1 + held.length);
    n.dataset.key = key;
    if (dock.firstChild?.dataset?.tid === String(top.id)) n.classList.add('still');
    n.dataset.tid = String(top.id);
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

  function refreshMore() {
    const n = held.length;
    moreChip.style.display = n && !dock ? '' : 'none';
    moreChip.textContent = `+${n} more this week`;
    renderDock();
  }

  // Shows the collapsed toasts (clicking the chip).
  function release() {
    const list = held;
    held = [];
    refreshMore();
    for (const t of list) show(t.text, t.tone, t.opts);
  }

  // Called with the game week; a new week resets the budget and drops last week's extras.
  function setWeek(w) {
    if (w === week) return;
    week = w;
    shownThisWeek = 0;
    held = [];
    refreshMore();
  }

  let seq = 0;
  function push(text, tone = 'info', opts = {}) {
    const t0 = toneOf(tone);
    if (t0 !== 'warn' && t0 !== 'bad' && !opts.action && shownThisWeek >= WEEK_BUDGET) {
      if (text !== lastText) held.push({ text, tone, opts });
      if (held.length > 20) held.shift();
      lastText = text;
      refreshMore();
      return;
    }
    shownThisWeek++;
    show(text, tone, opts);
  }

  function show(text, tone = 'info', { action } = {}) {
    if (!text) return;
    const now = performance.now();
    if (text === lastText && now - lastAt < 800) return;
    lastText = text;
    lastAt = now;
    const t = { id: ++seq, text, tone: toneOf(tone), timer: 0, node: null, action };
    live.push(t);
    t.timer = setTimeout(() => remove(t), LIFE[t.tone]);
    if (dock) renderDock();
    else { t.node = node(t, 'toast'); el.insertBefore(t.node, moreChip); }
    while (live.length > MAX_VISIBLE) remove(live[0]);
  }

  // Pass a panel's strip element to dock there, or null to go back to the corner stack.
  function setDock(d) {
    if (dock && dock !== d) dock.replaceChildren(h('span.dockidle'));
    dock = d;
    for (const t of live) if (t.node) { t.node.remove(); t.node = null; }
    if (dock) renderDock();
    else for (const t of live) { t.node = node(t, 'toast'); t.node.classList.add('still'); el.insertBefore(t.node, moreChip); }
    refreshMore();
  }

  return { push, setDock, setWeek, el };
}
