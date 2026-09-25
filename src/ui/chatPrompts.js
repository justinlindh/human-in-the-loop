// Founder reply prompts in Yak (state.chatPrompts): two or three replies hang under a staff post.
// Open: a button per reply with its effect hint; one the founder can't pick is disabled and shows
// why. Answered: a collapsed "You replied" line. Unanswered when it expired: a quiet line.
// Blocks live inside the prompted message, so replies threading under it stay below them.
import { h, setText } from './dom.js';

const weeksText = (n) => (n <= 1 ? 'last week to reply' : `${n} weeks to reply`);

export function createPromptView({ list, onAnswer }) {
  const views = new Map(); // promptId -> { el, sig, chatId }
  let prompts = [];

  function build(p) {
    const el = h('div.yprompt', { dataset: { prompt: p.id } });
    if (p.resolved) {
      el.classList.add('done');
      const pick = Number.isInteger(p.resolved.choice) ? p.options[p.resolved.choice] : null;
      el.append(pick
        ? h('div.yp-done', null, h('b', { text: 'You replied: ' }), pick.label)
        : h('div.yp-done', { text: 'Nobody replied in time.' }));
      return el;
    }
    const left = h('span.yp-left');
    el.append(h('div.yp-head', null, h('b', { text: 'Reply as the founder' }), left));
    p.options.forEach((o, i) => {
      const off = o.available === false;
      el.append(h(`button.yp-opt${off ? '.off' : ''}`, {
        type: 'button', disabled: off, 'aria-label': `${o.label}. ${off ? o.reason ?? 'Not available' : o.hint ?? ''}`,
        onclick: (e) => { e.stopPropagation(); onAnswer?.(p.id, i); },
      }, h('b.yp-label', { text: o.label }), h('span.yp-hint', { text: off ? o.reason ?? 'Not available' : o.hint ?? '' })));
    });
    el._left = left;
    return el;
  }

  // Puts each view inside its message, when that message is on screen.
  function attach() {
    for (const [id, v] of views) {
      const msg = list.querySelector(`.msg[data-id="${CSS.escape(v.chatId)}"] > .mcol`);
      if (msg && v.el.parentNode !== msg) msg.append(v.el);
      else if (!msg && v.el.isConnected) v.el.remove();
    }
  }

  // Called every frame; rebuilds only the prompts whose state changed.
  function sync(s) {
    const next = s?.chatPrompts ?? [];
    if (next === prompts && !next.some((p) => !p.resolved)) return;
    prompts = next;
    const seen = new Set();
    let changed = false;
    for (const p of next) {
      seen.add(p.id);
      const sig = `${p.resolved ? `r${p.resolved.choice}` : 'o'}|${p.options.map((o) => `${o.available !== false ? 1 : 0}${o.reason ?? ''}`).join(',')}`;
      let v = views.get(p.id);
      if (!v || v.sig !== sig) {
        v?.el.remove();
        v = { el: build(p), sig, chatId: p.chatId };
        views.set(p.id, v);
        changed = true;
      }
      if (!p.resolved && v.el._left) {
        const t = weeksText(Math.max(1, (p.expiresWeek ?? s.week + 1) - s.week));
        if (v.el._left.textContent !== t) setText(v.el._left, t);
      }
    }
    for (const [id, v] of views) if (!seen.has(id)) { v.el.remove(); views.delete(id); changed = true; }
    if (changed) attach();
  }

  const open = () => prompts.filter((p) => !p.resolved);
  return { sync, attach, open };
}
