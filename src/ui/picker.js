// The game's dropdown: a chunky button that opens a listbox of rows. It replaces native <select>
// so rows can carry a portrait, a role pill, a key stat and a busy or free tag, and so it looks
// the same everywhere.
//
// picker({ options, value, placeholder, onChange, keepValue, disabled, title, className })
//   options: [{ value, label, sub?, person?, role?, stat?, busy?, free?, disabled?, group?, icon? }]
//   onChange(value, option): called on a pick. When it returns { ok: false } the old value stays.
//   keepValue: false resets the button to the placeholder after each pick (an "Add person" menu).
// Returns { el, set(value), setOptions(options), setDisabled(on), value, open(), close() }.
//
// Touch: rows are 44 px under pointer:coarse, a tap outside closes, long lists scroll inside.
// Keyboard: arrows, Home and End, Enter or Space to pick, Escape or Tab to close, and typing
// jumps to the next row whose label starts with what was typed.

import { h } from './dom.js';
import { icon } from './icons.js';
import { portrait, roleChip } from './widgets.js';

let openOne = null; // only one list is open at a time
let seq = 0;

export function picker({ options = [], value = '', placeholder = 'Choose...', onChange, keepValue = true, disabled = false, title = '', className = '' } = {}) {
  const id = `pk${++seq}`;
  let opts = options;
  let cur = value ?? '';
  let pop = null, list = null, rows = [], active = -1, raf = 0;
  let typed = '', typedAt = 0;

  const face = h('span.pk-face');
  const btn = h(`button.gpick${className ? `.${className.split(' ').join('.')}` : ''}`, {
    type: 'button', title, 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); if (pop) close(); else open(); },
    onkeydown: (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); open(e.key === 'ArrowUp' ? 'last' : 'current'); }
    },
  }, face, h('span.pk-caret', null, icon('caret.down', { size: 12 })));
  btn.disabled = !!disabled;

  const pickable = (i) => i >= 0 && i < opts.length && !opts[i].disabled;

  function drawFace() {
    const o = opts.find((x) => x.value === cur);
    face.replaceChildren(...(o?.person ? [portrait(o.person, 20)] : []), h('span.pk-label', { text: o ? o.label : placeholder }));
    btn.classList.toggle('empty', !o);
  }

  function row(o, i) {
    const el = h('div.pk-row', { id: `${id}-${i}`, role: 'option', 'aria-selected': String(o.value === cur), 'aria-disabled': o.disabled ? 'true' : null },
      o.person ? portrait(o.person, 30) : o.icon ? h('span.pk-ico', null, icon(o.icon, { size: 20 })) : null,
      h('div.pk-main', null,
        h('div.pk-top', null, h('b', { text: o.label }), o.role ? roleChip(o.role) : null),
        o.sub ? h('div.pk-sub', { text: o.sub }) : null),
      o.stat ? h('span.pk-stat', { text: o.stat }) : null,
      o.busy ? h('span.pk-tag.busy', { text: o.busy === true ? 'Busy' : o.busy }) : o.free ? h('span.pk-tag.free', { text: 'Free' }) : null);
    el.classList.toggle('sel', o.value === cur);
    el.classList.toggle('off', !!o.disabled);
    el.addEventListener('pointermove', () => { if (active !== i && pickable(i)) setActive(i, false); });
    el.addEventListener('click', (e) => { e.stopPropagation(); if (pickable(i)) choose(i); });
    return el;
  }

  function build() {
    rows = [];
    const kids = [];
    let group = null;
    opts.forEach((o, i) => {
      if (o.group && o.group !== group) { group = o.group; kids.push(h('div.pk-group', { role: 'presentation', text: group })); }
      const r = row(o, i);
      rows.push(r);
      kids.push(r);
    });
    if (!opts.length) kids.push(h('div.pk-empty', { text: 'Nothing to pick' }));
    list.replaceChildren(...kids);
  }

  function place() {
    if (!pop) return;
    if (!btn.isConnected || btn.disabled) { close(false); return; }
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    const width = Math.min(vw - pad * 2, Math.max(r.width, 320));
    const left = Math.max(pad, Math.min(r.left, vw - width - pad));
    const below = vh - r.bottom - pad, above = r.top - pad;
    const want = Math.min(list.scrollHeight + 8, 360);
    const down = below >= want || below >= above;
    const max = Math.max(120, Math.min(360, down ? below : above));
    pop.style.left = `${left}px`;
    pop.style.width = `${width}px`;
    pop.style.maxHeight = `${max}px`;
    pop.style.top = down ? `${r.bottom + 4}px` : '';
    pop.style.bottom = down ? '' : `${vh - r.top + 4}px`;
    raf = requestAnimationFrame(place);
  }

  function setActive(i, scroll = true) {
    if (rows[active]) rows[active].classList.remove('pk-on');
    active = i;
    if (rows[i]) {
      rows[i].classList.add('pk-on');
      list.setAttribute('aria-activedescendant', rows[i].id);
      if (scroll) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function step(from, dir) {
    for (let k = 1; k <= opts.length; k++) {
      const i = (from + dir * k + opts.length * 2) % opts.length;
      if (pickable(i)) return i;
    }
    return from;
  }

  function onKey(e) {
    e.stopPropagation();
    const n = opts.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(step(active, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(step(active < 0 ? n : active, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === 'End') { e.preventDefault(); setActive(step(n, -1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (pickable(active)) choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = performance.now();
      typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = now;
      const start = typed.length === 1 ? active + 1 : Math.max(0, active);
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (pickable(i) && opts[i].label.toLowerCase().startsWith(typed)) { setActive(i); break; }
      }
    }
  }

  function outside(e) {
    if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(false);
  }

  function open(where = 'current') {
    if (btn.disabled || pop) return;
    openOne?.close(false);
    const root = btn.closest('.hitl') ?? document.body;
    list = h('div.pk-list', { role: 'listbox', tabindex: '-1', id: `${id}-list`, onkeydown: onKey });
    pop = h('div.pk-pop', { onpointerdown: (e) => e.stopPropagation() }, list);
    build();
    root.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', `${id}-list`);
    const at = opts.findIndex((o) => o.value === cur);
    place();
    setActive(where === 'last' ? step(opts.length, -1) : pickable(at) ? at : step(-1, 1));
    list.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    openOne = api;
  }

  function close(refocus = true) {
    if (!pop) return;
    cancelAnimationFrame(raf);
    document.removeEventListener('pointerdown', outside, true);
    pop.remove();
    pop = null; list = null; rows = []; active = -1;
    btn.setAttribute('aria-expanded', 'false');
    if (openOne === api) openOne = null;
    if (refocus && btn.isConnected) btn.focus({ preventScroll: true });
  }

  function choose(i) {
    const o = opts[i];
    close();
    const prev = cur;
    if (keepValue) { cur = o.value; drawFace(); }
    const res = onChange?.(o.value, o);
    if (keepValue && res && res.ok === false) { cur = prev; drawFace(); }
  }

  const api = {
    el: btn,
    get value() { return cur; },
    set(v) { cur = v ?? ''; drawFace(); },
    setOptions(o) { opts = o; drawFace(); if (pop) build(); },
    setDisabled(on) { btn.disabled = !!on; if (on) close(false); },
    open,
    close,
  };
  drawFace();
  return api;
}

// Row fields for a person: portrait, role pill, level, and busy or free from their assignment.
export function personOption(p, { value = p.id, label = p.name, sub, stat, busy, free } = {}) {
  const idle = p.assignment?.type === 'idle';
  return { value, label, person: p, role: p.role, sub, stat: stat ?? `Lv${p.level}`, busy: busy ?? (idle ? null : true), free: free ?? idle, disabled: p.mood === 'away' };
}

