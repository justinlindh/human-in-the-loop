import { h, toggleClass, setText, clear } from './dom.js';

export const MENU = [
  { id: 'build', label: 'Build', icon: '🔨', key: 'B', accent: '#4f8cff' },
  { id: 'staff', label: 'Staff', icon: '🧑‍💻', key: 'S', accent: '#34c38f' },
  { id: 'marketing', label: 'Marketing', icon: '📣', key: 'M', accent: '#ffb020' },
  { id: 'models', label: 'Models', icon: '🧠', key: 'V', accent: '#9b6bff' },
  { id: 'automation', label: 'Automation', icon: '🤖', key: 'A', accent: '#3fb6b0' },
  { id: 'ops', label: 'Ops', icon: '🛡️', key: 'O', accent: '#e5484d' },
  { id: 'office', label: 'Office', icon: '🏢', key: 'F', accent: '#d98c5f' },
  { id: 'reports', label: 'Reports', icon: '📊', key: 'R', accent: '#5b6cff' },
];

// Bottom menu plus the single open panel. Panels are { title, icon, accent, wide?, build(ctx, arg) -> { el, update?(state), foot? , destroy?() } }.
export function createMenu({ bottom, panelRoot, panels, ctx, onChange }) {
  const buttons = {};
  const badges = {};
  const menu = h('div.menu');
  for (const m of MENU) {
    const badge = h('span.badge');
    badges[m.id] = badge;
    buttons[m.id] = h('button.mbtn', { title: `${m.label} (${m.key})`, onclick: () => toggle(m.id) },
      badge, h('span.key', { text: m.key }), h('span.ico', { text: m.icon }), h('span.lbl', { text: m.label }));
    menu.append(buttons[m.id]);
  }
  bottom.append(menu);

  const wrap = h('div.panel-wrap');
  panelRoot.append(wrap);

  let current = null; // { id, inst, el }

  function close() {
    if (!current) return false;
    current.inst.destroy?.();
    current.el.remove();
    if (buttons[current.id]) toggleClass(buttons[current.id], 'active', false);
    const was = current.id;
    current = null;
    onChange?.(null, was);
    return true;
  }

  function open(id, arg) {
    const def = panels[id];
    if (!def) return;
    if (current) close();
    const meta = MENU.find((m) => m.id === id) ?? {};
    const inst = def.build(ctx, arg);
    const title = h('h2', { text: def.title ?? meta.label });
    const head = h('div.panel-head', null,
      h('span.ico', { text: def.icon ?? meta.icon ?? '' }), title,
      h('button.btn.x', { title: 'Close (Esc)', onclick: () => close(), text: '✕' }));
    const body = h('div.panel-body', null, inst.el);
    const el = h(`div.panel${def.wide ? '.wide' : ''}`, { style: { '--accent': def.accent ?? meta.accent ?? '#4f8cff' } },
      head, inst.tabs ?? null, body, inst.foot ?? null);
    inst.setTitle = (t) => setText(title, t);
    inst.body = body;
    wrap.append(el);
    current = { id, inst, el };
    if (buttons[id]) toggleClass(buttons[id], 'active', true);
    inst.update?.(ctx.getState(), true);
    onChange?.(id, null);
  }

  function toggle(id, arg) {
    if (current?.id === id) close();
    else open(id, arg);
  }

  function update(state) {
    current?.inst.update?.(state, false);
  }

  function setBadge(id, n) {
    const b = badges[id];
    if (!b) return;
    toggleClass(b, 'show', n > 0);
    setText(b, n > 9 ? '9+' : n);
  }

  function setAlarm(id, on) {
    if (buttons[id]) toggleClass(buttons[id], 'alarm', on);
  }

  return { open, close, toggle, update, setBadge, setAlarm, get current() { return current?.id ?? null; }, get panelEl() { return current?.el ?? null; }, clearAll: () => { close(); clear(wrap); } };
}
