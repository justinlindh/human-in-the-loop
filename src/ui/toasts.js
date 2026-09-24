import { h } from './dom.js';

const MAX_VISIBLE = 5;
const LIFE = { info: 4000, good: 4000, warn: 7000, bad: 7000 };
const ICON = { info: '💬', good: '✨', warn: '⚠️', bad: '🔥' };

export function createToasts(root) {
  const el = h('div.toasts', { 'aria-live': 'polite' });
  root.append(el);
  const live = [];
  let lastText = '';
  let lastAt = 0;

  function remove(t) {
    const i = live.indexOf(t);
    if (i < 0) return;
    live.splice(i, 1);
    clearTimeout(t.timer);
    t.node.classList.add('out');
    setTimeout(() => t.node.remove(), 230);
  }

  function push(text, tone = 'info') {
    if (!text) return;
    const now = performance.now();
    if (text === lastText && now - lastAt < 800) return;
    lastText = text;
    lastAt = now;
    const t = { node: null, timer: 0 };
    t.node = h(`div.toast.${LIFE[tone] ? tone : 'info'}`, { onclick: () => remove(t) },
      h('span.ico', { text: ICON[tone] ?? ICON.info }), h('span', { text }));
    el.append(t.node);
    live.push(t);
    t.timer = setTimeout(() => remove(t), LIFE[tone] ?? LIFE.info);
    while (live.length > MAX_VISIBLE) remove(live[0]);
  }

  return { push, el };
}
