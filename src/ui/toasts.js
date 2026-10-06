import { pnow, pAfter, pClear } from './pclock.js';
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
const PLAYER_MS = 1500; // how long after a tap or key press a toast still counts as its answer

// Toasts stack top-right when no panel is open. While a panel is open they show one at a
// time in a strip reserved at the bottom of the panel, so they never cover its controls.
const ANSWER_MS = 4000;
const TONE_RANK = { bad: 3, warn: 2, good: 1, info: 0 };
// The toast a panel's dock shows: the most severe live one (newest among equals), except that a toast
// answering the player's own action (a refusal's reason) outranks any severity for a few seconds.
export function dockTop(live, now) {
  const rank = (t) => TONE_RANK[t.tone] + (t.answer && now - t.at < ANSWER_MS ? 10 : 0);
  let top = live[0];
  for (const t of live) if (rank(t) >= rank(top)) top = t;
  return top;
}
// Under quietToasts the stack is slower: game-started toasts appear at least this far apart, and news about
// the same subject folds into the one already waiting or just shown.
const QUIET_GAP_MS = 30000;
// An info or good toast still waiting after this long is no longer news and is dropped.
const QUIET_STALE_MS = 30000;
const QUIET_QUEUE = 5;
export function createToasts(root, { canShow = () => true, quiet = () => false } = {}) {
  const el = h('div.toasts', { 'aria-live': 'polite' });
  root.append(el);
  // A toast raised just after the player's own tap or key press answers them (a failed action's
  // reason, a result they asked for): it shows at once, even while canShow() holds the rest.
  let inputAt = -Infinity;
  const onInput = () => { inputAt = performance.now(); };
  addEventListener('pointerdown', onInput, true);
  addEventListener('keydown', onInput, true);
  const playerCaused = () => performance.now() - inputAt < PLAYER_MS;
  const mayShow = (opts) => !!opts?.player || canShow();
  let live = [];
  let dock = null;
  let lastText = '';
  let lastAt = 0;
  let week = null;
  let shownThisWeek = 0;
  let held = [];
  let frozen = false; // tools hold every toast on screen while they look at it
  function arm(t, ms) {
    pClear(t.timer);
    t.ms = ms;
    t.timer = frozen ? 0 : pAfter(ms, () => remove(t));
  }
  function freeze(on) {
    frozen = !!on;
    for (const t of live) if (frozen) pClear(t.timer); else arm(t, t.ms ?? LIFE[t.tone]);
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
    // A toast that answers the player's own tap (a refusal's reason) outranks a severe one for a few seconds.
    const top = dockTop(live, pnow());
    const key = `${top.id}:${live.length}:${held.length}`;
    if (dock.firstChild?.dataset?.key === key) return;
    const n = node(top, 'dtoast', live.length - 1 + held.length);
    n.dataset.key = key;
    if (dock.firstChild?.dataset?.tid === String(top.id)) n.classList.add('still');
    n.dataset.tid = String(top.id);
    dock.replaceChildren(n);
    markCut(n);
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
    pClear(t.timer);
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
    moreChip.style.display = n && !dock && !quiet() ? '' : 'none';
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
  const isWarn = (q) => q.tone === 'warn' || q.tone === 'bad';
  // Under quietToasts a warning ranks above everything, so it is shown first and is the last to go.
  const weight = (q) => (quiet() && isWarn(q) ? 8 : 0) + (q.opts.always ? 4 : 0) + (q.opts.action ? 2 : 0) + (toneOf(q.tone) === 'good' ? 1 : 0);
  // News about a subject that is already waiting, or was shown a moment ago, replaces that toast's words
  // instead of adding another.
  function mergeBySubject(text, tone, opts) {
    const sub = opts.subject;
    const t0 = toneOf(tone);
    const q = queue.find((x) => x.opts.subject === sub);
    if (q) { q.text = text; if (TONE_RANK[t0] > TONE_RANK[toneOf(q.tone)]) q.tone = t0; q.opts = { ...q.opts, ...opts }; return true; }
    const t = live.find((x) => x.subject === sub && pnow() - x.at < QUIET_GAP_MS);
    if (!t) return false;
    t.text = text;
    if (TONE_RANK[t0] > TONE_RANK[t.tone]) t.tone = t0;
    const tt = t.node?.querySelector('.tt');
    if (tt) tt.textContent = text;
    if (dock?.firstChild) dock.firstChild.dataset.key = '';
    arm(t, LIFE[t.tone]);
    renderDock();
    return true;
  }
  function push(text, tone = 'info', opts = {}) {
    const t0 = toneOf(tone);
    if (!opts.player && playerCaused() && (!canShow() || quiet())) opts = { ...opts, player: true, timed: true };
    if (opts.player && !canShow()) { shownThisWeek++; show(text, tone, opts); return; }
    const q = quiet();
    // The player's own action is answered at once, whatever the spacing.
    if (q && opts.player) { shownThisWeek++; show(text, tone, opts); return; }
    if (q && opts.subject && !opts.player && mergeBySubject(text, tone, opts)) return;
    if (canShow() && (t0 === 'bad' || (t0 === 'warn' && !q))) { shownThisWeek++; showTagged(text, tone, opts); return; }
    queue.push({ text, tone, opts, n: ++qSeq, at: pnow() });
    if (queue.length > (q ? QUIET_QUEUE : 16)) {
      queue.sort((x, y) => weight(y) - weight(x) || x.n - y.n);
      if (!q) hold(queue.pop());
      else { const i = queue.findLastIndex((x) => !isWarn(x)); if (i >= 0) queue.splice(i, 1); }
    }
    if (!qTimer) qTimer = pAfter(nextAt - pnow(), drain);
  }
  // Shows a toast and remembers its subject, so later news about the same subject can fold into it.
  function showTagged(text, tone, opts) {
    const before = live.length;
    show(text, tone, opts);
    const t = live[live.length - 1];
    if (opts.subject && t && t.text === text && (live.length > before || t.at === pnow())) t.subject = opts.subject;
  }
  function hold(q) {
    if (q.text !== lastText) held.push(q);
    if (held.length > 20) held.shift();
    refreshMore();
  }
  function drain() {
    qTimer = 0;
    if (quiet()) queue = queue.filter((x) => isWarn(x) || pnow() - x.at <= QUIET_STALE_MS);
    if (!queue.length) return;
    if (!canShow()) { qTimer = pAfter(GAP_MS, drain); return; }
    queue.sort((x, y) => weight(y) - weight(x) || x.n - y.n);
    const q = queue.shift();
    if (!quiet() && !['warn', 'bad'].includes(q.tone) && !q.opts.always && !q.released && shownThisWeek >= WEEK_BUDGET) hold(q);
    else { shownThisWeek++; showTagged(q.text, q.tone, q.opts); nextAt = pnow() + (quiet() ? QUIET_GAP_MS : GAP_MS); }
    if (queue.length) qTimer = pAfter(nextAt - pnow(), drain);
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
    const now = pnow();
    const due = waiting.filter((w) => w.tone === 'warn' || w.tone === 'bad' || now - w.at < STALE_MS);
    waiting = [];
    // Least important first, so the most important are the last trimmed to the phone's two.
    due.sort((a, b) => (RANK[a.tone] - RANK[b.tone]) || (a.at - b.at));
    for (const w of due) show(w.text, w.tone, w.opts, w.at);
  }

  function show(text, tone = 'info', { action, glyph, person, player, timed } = {}, at = pnow()) {
    if (!text) return;
    if (!mayShow({ player })) { push(text, tone, { action, glyph, person }); return; }
    if (hidden) {
      waiting.push({ text, tone: toneOf(tone), opts: { action, glyph, person }, at });
      if (waiting.length > MAX_WAITING) waiting.shift();
      return;
    }
    const now = pnow();
    if (text === lastText && now - lastAt < 800) return;
    lastText = text;
    lastAt = now;
    const t = { id: ++seq, text, tone: toneOf(tone), timer: 0, node: null, action, glyph, person, at, answer: !!player && !timed };
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
