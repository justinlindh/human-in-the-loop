import { phoneLayout } from './media.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { portrait } from './widgets.js';

const MAX_VISIBLE = 5;
// Phones (narrow, or short in landscape) keep at most two, docked in one line above the bottom row.
const maxVisible = () => (phoneLayout() ? 2 : MAX_VISIBLE);
const LIFE = { info: 6500, good: 6500, warn: 9000, bad: 9000 };
// Toasts shown per game week before the rest collapse into a "+N more" chip. Warn and bad always
// show; clickable ones count like any other, and keep their action in the chip.
const WEEK_BUDGET = 3;
// Info and good toasts that arrive together appear this far apart, so a busy moment builds up a
// stack instead of dropping it all at once. Warn and bad show at once.
const GAP_MS = 700;

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
  let frozen = false; // tools hold every toast on screen while they look at it
  function arm(t, ms) {
    clearTimeout(t.timer);
    t.ms = ms;
    t.timer = frozen ? 0 : setTimeout(() => remove(t), ms);
  }
  function freeze(on) {
    frozen = !!on;
    for (const t of live) if (frozen) clearTimeout(t.timer); else arm(t, t.ms ?? LIFE[t.tone]);
  }
  const moreChip = h('button.toast-more', { onclick: () => release() });
  moreChip.style.display = 'none';
  el.append(moreChip);


  const toneOf = (t) => (LIFE[t] ? t : 'info');

  // A toast cut short (phones keep them to one line) shows a "more" cue; the first tap opens it in
  // full and restarts its timer, the next tap acts or dismisses it. An opened toast stays open when
  // it moves between the corner and a panel's dock.
  function node(t, cls, more = 0) {
    return h(`div.${cls}.${t.tone}${t.action ? '.clickable' : ''}${t.open ? '.cut.open' : ''}`, { dataset: { occludes: '' }, onclick: (e) => {
      const n = e.currentTarget;
      if (n.classList.contains('cut') && !n.classList.contains('open')) {
        n.classList.add('open');
        t.open = true;
        arm(t, LIFE[t.tone] + 4000);
        return;
      }
      t.action?.(); remove(t);
    } },
      t.person ? h('span.ico.face', null, portrait(t.person, 24)) : h('span.ico', null, icon(t.glyph ?? `toast.${t.tone}`)), h('span.tt', { text: t.text }),
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

  // After layout: does the text fit, or is it cut off?
  function markCut(n) {
    requestAnimationFrame(() => {
      const tt = n.querySelector('.tt');
      if (tt && n.isConnected && !n.classList.contains('open')) n.classList.toggle('cut', tt.scrollWidth > tt.clientWidth + 1 || tt.scrollHeight > tt.clientHeight + 1);
    });
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
    for (const t of list) queue.push({ ...t, released: true, n: ++qSeq });
    if (queue.length && !qTimer) drain();
  }

  // Called with the game week; a new week resets the budget and drops last week's extras.
  function setWeek(w) {
    if (w === week) return;
    week = w;
    shownThisWeek = 0;
    held = [];
    for (const q of queue) q.released = false;
    refreshMore();
  }

  let seq = 0;
  // Warn and bad show at once. Info and good wait in a short queue and are shown GAP_MS apart,
  // most important first (clickable before plain, good before info), so when the weekly budget
  // runs out it is the minor ones that fold into the "+N more" chip.
  let queue = [], nextAt = 0, qTimer = 0, qSeq = 0;
  const weight = (q) => (q.opts.always ? 4 : 0) + (q.opts.action ? 2 : 0) + (toneOf(q.tone) === 'good' ? 1 : 0);
  function push(text, tone = 'info', opts = {}) {
    const t0 = toneOf(tone);
    if (t0 === 'warn' || t0 === 'bad') { shownThisWeek++; show(text, tone, opts); return; }
    queue.push({ text, tone, opts, n: ++qSeq });
    if (queue.length > 16) { queue.sort((x, y) => weight(y) - weight(x) || x.n - y.n); hold(queue.pop()); }
    if (!qTimer) qTimer = setTimeout(drain, Math.max(0, nextAt - performance.now()));
  }
  function hold(q) {
    if (q.text !== lastText) held.push(q);
    if (held.length > 20) held.shift();
    refreshMore();
  }
  function drain() {
    qTimer = 0;
    if (!queue.length) return;
    queue.sort((x, y) => weight(y) - weight(x) || x.n - y.n);
    const q = queue.shift();
    if (!q.opts.always && !q.released && shownThisWeek >= WEEK_BUDGET) hold(q);
    else { shownThisWeek++; show(q.text, q.tone, q.opts); nextAt = performance.now() + GAP_MS; }
    if (queue.length) qTimer = setTimeout(drain, Math.max(0, nextAt - performance.now()));
  }

  // While hidden (a phone during placement or a card), toasts wait instead of timing out unseen.
  // When the view clears, warnings always show; info and good ones only if still fresh.
  const STALE_MS = 10000, MAX_WAITING = 10;
  let hidden = false, waiting = [];
  function setHidden(on) {
    on = !!on;
    if (on === hidden) return;
    hidden = on;
    if (on) {
      for (const t of [...live]) { waiting.push({ text: t.text, tone: t.tone, opts: { action: t.action, glyph: t.glyph, person: t.person }, at: t.at }); remove(t); }
      waiting = waiting.slice(-MAX_WAITING);
      return;
    }
    const now = performance.now();
    const due = waiting.filter((w) => w.tone === 'warn' || w.tone === 'bad' || now - w.at < STALE_MS);
    waiting = [];
    // Least important first, so the most important are the last trimmed to the phone's two.
    due.sort((a, b) => (RANK[a.tone] - RANK[b.tone]) || (a.at - b.at));
    for (const w of due) show(w.text, w.tone, w.opts, w.at);
  }

  function show(text, tone = 'info', { action, glyph, person } = {}, at = performance.now()) {
    if (!text) return;
    if (hidden) {
      waiting.push({ text, tone: toneOf(tone), opts: { action, glyph, person }, at });
      if (waiting.length > MAX_WAITING) waiting.shift();
      return;
    }
    const now = performance.now();
    if (text === lastText && now - lastAt < 800) return;
    lastText = text;
    lastAt = now;
    const t = { id: ++seq, text, tone: toneOf(tone), timer: 0, node: null, action, glyph, person, at };
    live.push(t);
    arm(t, LIFE[t.tone]);
    if (dock) renderDock();
    else { t.node = node(t, 'toast'); el.insertBefore(t.node, moreChip); markCut(t.node); }
    while (live.length > maxVisible()) remove(live[0]);
  }

  // Pass a panel's strip element to dock there, or null to go back to the corner stack.
  function setDock(d) {
    if (dock && dock !== d) dock.replaceChildren(h('span.dockidle'));
    dock = d;
    for (const t of live) if (t.node) { t.node.remove(); t.node = null; }
    if (dock) renderDock();
    else for (const t of live) { t.node = node(t, 'toast'); t.node.classList.add('still'); el.insertBefore(t.node, moreChip); markCut(t.node); }
    refreshMore();
  }

  return { push, setDock, setWeek, setHidden, freeze, el };
}
