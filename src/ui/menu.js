import { h, toggleClass, setText, clear } from './dom.js';
import { icon } from './icons.js';

export const MENU = [
  { id: 'build', label: 'Build', key: 'B', accent: '#4f8cff' },
  { id: 'staff', label: 'Staff', key: 'S', accent: '#34c38f' },
  { id: 'marketing', label: 'Marketing', key: 'M', accent: '#ffb020' },
  { id: 'models', label: 'Models', key: 'V', accent: '#9b6bff' },
  { id: 'automation', label: 'Automation', key: 'A', accent: '#3fb6b0' },
  { id: 'ops', label: 'Ops', key: 'O', accent: '#e5484d' },
  { id: 'office', label: 'Office', key: 'F', accent: '#d98c5f' },
  { id: 'reports', label: 'Reports', key: 'R', accent: '#5b6cff' },
];

// Bottom menu plus the single open panel. Panels are { title, icon, accent, wide?, build(ctx, arg) -> { el, update?(state), foot? , destroy?() } }.
export function createMenu({ bottom, panelRoot, panels, ctx, onChange }) {
  const buttons = {};
  const badges = {};
  const labels = {};
  const newTags = {};
  const icos = {};
  const iconOf = {}; // menu id -> icon id when it differs from menu.<id>
  const hidden = new Set();
  const menu = h('div.menu');
  for (const m of MENU) {
    const badge = h('span.badge');
    badges[m.id] = badge;
    labels[m.id] = h('span.lbl', { text: m.label });
    newTags[m.id] = h('span.newtag', { text: 'New!' });
    buttons[m.id] = h('button.mbtn', { title: `${m.label} (${m.key})`, dataset: { menu: m.id }, onclick: () => toggle(m.id) },
      badge, newTags[m.id], h('span.key', { text: m.key }), icos[m.id] = h('span.ico', null, icon(`menu.${m.id}`)), labels[m.id]);
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
    if (!def || hidden.has(id)) return;
    if (current) close();
    const meta = MENU.find((m) => m.id === id) ?? {};
    const inst = def.build(ctx, arg);
    const title = h('h2', { text: def.title ?? meta.label });
    const head = h('div.panel-head', null,
      h('span.ico', null, icon(iconOf[id] ?? def.icon ?? `menu.${id}`, { size: 24 })), title,
      h('button.btn.x', { title: 'Close (Esc)', onclick: () => close() }, icon('close')));
    const body = h('div.panel-body', null, inst.el);
    const dock = h('div.panel-dock');
    const el = h(`div.panel${def.wide ? '.wide' : ''}`, { style: { '--accent': def.accent ?? meta.accent ?? '#4f8cff' } },
      head, inst.tabs ?? null, body, inst.foot ?? null, dock);
    inst.setTitle = (t) => setText(title, t);
    inst.body = body;
    wrap.append(el);
    current = { id, inst, el, dock };
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

  // Progressive unlocks: hidden buttons take no space; revealing one can slide it in.
  function setVisible(id, on, { animate = false } = {}) {
    const b = buttons[id];
    if (!b || on === !hidden.has(id)) return;
    if (on) hidden.delete(id); else { hidden.add(id); if (current?.id === id) close(); }
    b.style.display = on ? '' : 'none';
    if (on && animate) { b.classList.remove('slidein'); void b.offsetWidth; b.classList.add('slidein'); }
  }

  function setNew(id, on) {
    if (newTags[id]) toggleClass(newTags[id], 'show', on);
  }

  function setLabel(id, text) {
    const m = MENU.find((x) => x.id === id);
    if (!labels[id] || labels[id].textContent === text) return;
    setText(labels[id], text);
    buttons[id].title = `${text} (${m?.key})`;
  }

  // Swaps a menu button's icon (and its panel header's) while the button stands for something else.
  function setIcon(id, iconId) {
    const want = iconId === `menu.${id}` ? undefined : iconId;
    if (!icos[id] || iconOf[id] === want) return;
    iconOf[id] = want;
    icos[id].replaceChildren(icon(iconId));
  }

  return { open, close, toggle, update, setBadge, setAlarm, setVisible, setNew, setLabel, setIcon, isVisible: (id) => !hidden.has(id), get current() { return current?.id ?? null; }, get dockEl() { return current?.dock ?? null; }, clearAll: () => { close(); clear(wrap); } };
}
