import { h, setText, dateOf } from './dom.js';

const MAX_LINES = 50;

export function createChat(root, { onToggle } = {}) {
  let collapsed = false;
  let unread = 0;
  const count = h('span.count', { text: '0' });
  const caret = h('span.caret', { text: '▾' });
  const body = h('div.chat-body');
  const head = h('div.chat-head', { title: 'Office chat (C)', onclick: () => toggle() },
    h('span.hash', { text: '#' }), h('span', { text: 'general' }), count, caret);
  const quiet = h('div.chat-quiet', { text: 'Quiet in here. Chatter shows up once the week gets going.' });
  body.append(quiet);
  const el = h('div.chat', null, head, body);
  root.append(el);
  count.style.display = 'none';

  function toggle(force) {
    collapsed = force ?? !collapsed;
    el.classList.toggle('collapsed', collapsed);
    setText(caret, collapsed ? '▸' : '▾');
    if (!collapsed) { unread = 0; count.style.display = 'none'; body.scrollTop = body.scrollHeight; }
    onToggle?.(collapsed);
  }

  function add(from, text, week) {
    if (quiet.isConnected) quiet.remove();
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    const bot = String(from).startsWith('@');
    const d = Number.isFinite(week) ? dateOf(week) : null;
    body.append(h(`div.chat-line${bot ? '.bot' : ''}`, null,
      d ? h('span.w.num', { text: `W${d.week}` }) : null,
      h('b', { text: from }), ` ${text}`));
    while (body.childElementCount > MAX_LINES) body.firstElementChild.remove();
    if (collapsed) {
      unread++;
      count.style.display = '';
      setText(count, unread > 99 ? '99+' : unread);
    } else if (nearBottom) {
      body.scrollTop = body.scrollHeight;
    }
  }

  return { add, toggle, el };
}
