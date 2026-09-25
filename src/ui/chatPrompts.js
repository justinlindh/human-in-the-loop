// Founder reply prompts in Yak (state.chatPrompts): two or three replies hang under a staff post.
// Open: a button per reply with its effect hint; one the founder can't pick is disabled and shows
// why. Answered: a collapsed "You replied" line. Unanswered when it expired: a quiet line.
// Blocks live inside the prompted message, so replies threading under it stay below them.
import { h, setText } from './dom.js';

const weeksText = (n) => (n <= 1 ? 'last week to reply' : `${n} weeks to reply`);

// What a prompt's view shows: its resolution and which replies are available (and why not).
export const promptSig = (p) => `${p.id}:${p.resolved ? `r${p.resolved.choice}` : 'o'}:${p.options.map((o) => (o.available === false ? `0${o.reason ?? ''}` : '1')).join(',')}`;
// Every prompt plus the week (for "weeks to reply"): unchanged means nothing on screen changes.
export const promptsSig = (list, week) => `${week}|${list.map(promptSig).join('|')}`;

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

  // Called every frame. The sim resolves a prompt in place on the same array, so the check is a
  // signature over every prompt, not the array's identity; views rebuild only when theirs changed.
  let lastSig = '';
  function sync(s) {
    const next = s?.chatPrompts ?? [];
    const all = promptsSig(next, s?.week);
    if (all === lastSig) return;
    lastSig = all;
    prompts = next;
    const seen = new Set();
    let changed = false;
    for (const p of next) {
      seen.add(p.id);
      const sig = promptSig(p);
      let v = views.get(p.id);
      if (!v || v.sig !== sig) {
        v?.el.remove();
        v = { el: build(p), sig, chatId: p.chatId };
        views.set(p.id, v);
        changed = true;
      }
      if (!p.resolved && v.el._left) setText(v.el._left, weeksText(Math.max(1, (p.expiresWeek ?? s.week + 1) - s.week)));
    }
    for (const [id, v] of views) if (!seen.has(id)) { v.el.remove(); views.delete(id); changed = true; }
    if (changed) attach();
  }

  const open = () => prompts.filter((p) => !p.resolved);
  return { sync, attach, open };
}
