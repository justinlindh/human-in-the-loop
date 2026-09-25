// The founder's quick posts in Yak: a Post button at the foot of Yak opens a picker of predefined
// posts (a pep talk, "who broke prod?", pizza...). Everything about them comes from the sim's
// postOptions(state): label, effect hint, and why one can't be posted now. The post and the team's
// replies arrive as ordinary chat, so they thread like any message. Without the sim helper the
// bar stays hidden. On phones the picker opens as a sheet over the bottom of the screen.
import { h, setText, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { SIMX } from './simapi.js';
import { phoneLayout } from './media.js';

export function createPostBar({ layer, getState, onPost }) {
  let open = null; // the open picker element
  let sig = '';

  const status = h('span.ypost-status');
  const btn = h('button.btn.blue.ypost-btn', { type: 'button', 'aria-haspopup': 'dialog', onclick: (e) => { e.stopPropagation(); if (open) close(); else show(); } },
    icon('channel.community', { size: 14 }), ' Post');
  const bar = h('div.ypost', null, btn, status);
  bar.style.display = 'none';

  const options = () => SIMX.postOptions?.(getState()) ?? null;

  function row(o) {
    const off = o.available === false;
    return h(`button.ypost-opt${off ? '.off' : ''}`, {
      type: 'button', disabled: off, 'aria-label': `${o.label}. ${off ? o.reason ?? 'Not now' : o.hint ?? ''}`,
      onclick: (e) => { e.stopPropagation(); if (onPost?.(o)?.ok) { close(); week = null; } },
    },
    h('span.ypost-ico', null, icon(o.icon ?? 'channel.community', { size: 20 })),
    h('span.ypost-main', null, h('b', { text: o.label }), h('span.ypost-hint', { text: o.hint ?? '' })),
    h(`span.ypost-tag${off ? '.wait' : ''}`, { text: off ? o.reason ?? 'Not now' : 'Ready' }));
  }

  function show() {
    const list = options();
    if (!list) return;
    close();
    const sheet = phoneLayout();
    open = h(`div.ypost-pick${sheet ? '.sheet' : ''}`, { role: 'dialog', 'aria-label': 'Post to Yak', dataset: { occludes: '' }, onpointerdown: (e) => e.stopPropagation() },
      h('div.ypost-head', null, h('b', { text: 'Post to Yak' }), h('button.btn.small.ypost-x', { type: 'button', 'aria-label': 'Close', onclick: (e) => { e.stopPropagation(); close(); } }, icon('close', { size: 12 }))),
      ...list.map(row));
    (sheet ? layer : bar).append(open);
    btn.setAttribute('aria-expanded', 'true');
    addEventListener('pointerdown', outside, true);
    addEventListener('keydown', esc, true);
    open.querySelector('.ypost-opt:not(:disabled)')?.focus({ preventScroll: true });
  }
  function close() {
    if (!open) return;
    open.remove();
    open = null;
    btn.setAttribute('aria-expanded', 'false');
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', esc, true);
  }
  const outside = (e) => { if (open && !open.contains(e.target) && !btn.contains(e.target)) close(); };
  const esc = (e) => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

  // Per frame: cheap. The options are read once a week (and whenever the picker opens).
  let week = null;
  function update(s) {
    if (s.week === week) return;
    week = s.week;
    const list = SIMX.postOptions ? SIMX.postOptions(s) : null;
    const ready = list ? list.filter((o) => o.available !== false).length : 0;
    const next = list ? `${list.length}|${ready}` : 'none';
    if (next === sig) return;
    sig = next;
    bar.style.display = list ? '' : 'none';
    setText(status, !list ? '' : ready ? `${ready} ready` : 'Nothing to post right now');
    toggleClass(bar, 'none-ready', !!list && !ready);
    if (open) { close(); show(); }
  }

  return { bar, update, close, get open() { return !!open; } };
}
