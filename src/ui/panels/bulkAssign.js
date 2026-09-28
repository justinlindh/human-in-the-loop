// Staff up: move several people from maintenance or idle onto one project, filtered by where they are,
// role and seniority. Each move is an ordinary assign dispatch.
import { h, setText, toggleClass } from '../dom.js';
import { ROLES, roleName } from '../content.js';
import { portrait } from '../widgets.js';
import { icon } from '../icons.js';
import { STATS } from '../stats.js';
import { isAvailable, projectLabel } from './common.js';

export const FROM = [{ id: 'maintenance', label: 'Maintenance' }, { id: 'idle', label: 'Idle' }];
export const SENIORITY = [{ id: 'junior', label: 'Junior' }, { id: 'mid', label: 'Mid' }, { id: 'senior', label: 'Senior' }];

// People who could be moved onto the project: available, and on maintenance or idle.
export function staffUpPool(s) {
  return s.staff.filter((p) => isAvailable(p) && FROM.some((f) => f.id === p.assignment?.type));
}

// The pool narrowed by the chosen sets (an empty set means any).
export function staffUpMatches(pool, { from, roles, seniority }) {
  return pool.filter((p) => (!from.size || from.has(p.assignment.type)) && (!roles.size || roles.has(p.role)) && (!seniority.size || seniority.has(p.seniority)));
}

export function openStaffUp(ctx, projectId) {
  const s0 = ctx.getState();
  const proj = s0.projects.find((j) => j.id === projectId);
  if (!proj) return;
  const pool = staffUpPool(s0);
  const f = { from: new Set(), roles: new Set(), seniority: new Set() };
  const picked = new Set();
  let close = null;

  const chipsEl = h('div.col.sufilters');
  const listEl = h('div.picker.sulist');
  const countEl = h('span.small.muted');
  const goT = h('span');
  const go = h('button.btn.go.big', { onclick: () => commit() }, icon('launch'), ' ', goT);

  const chip = (label, on, onTap) => {
    const b = h('button.btn.small.suchip', { onclick: () => { onTap(); render(); } }, label);
    toggleClass(b, 'on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    return b;
  };
  const flip = (set, id) => { if (set.has(id)) set.delete(id); else set.add(id); };
  const group = (title, items, set) => h('div.row.wrap.sugroup', null, h('b.small.sulabel', { text: title }),
    chip('Any', !set.size, () => set.clear()),
    ...items.map((it) => chip(it.label, set.has(it.id), () => flip(set, it.id))));

  function render() {
    const roles = [...new Set(pool.map((p) => p.role))].map((id) => ({ id, label: roleName(id) }));
    const levels = SENIORITY.filter((x) => pool.some((p) => p.seniority === x.id));
    chipsEl.replaceChildren(
      group('From', FROM.filter((x) => pool.some((p) => p.assignment.type === x.id)), f.from),
      roles.length > 1 ? group('Role', roles, f.roles) : null,
      levels.length > 1 ? group('Level', levels, f.seniority) : null);
    const shown = staffUpMatches(pool, f);
    // Filters pick: everyone shown starts picked; a tap on a row drops or re-adds them.
    picked.clear();
    for (const p of shown) picked.add(p.id);
    listEl.replaceChildren(...(shown.length ? shown.map(row) : [h('div.empty.small', { text: 'Nobody matches. Try Any.' })]));
    sync();
  }

  function row(p) {
    const best = STATS.reduce((m, y) => ((p.skills?.[y.id] ?? 0) > (p.skills?.[m.id] ?? 0) ? y : m), STATS[0]);
    const el = h('button.pick', { onclick: () => { flip(picked, p.id); toggleClass(el, 'on', picked.has(p.id)); sync(); } },
      h('span.check', null, icon('check')),
      portrait(p, 30),
      h('span.pn', null, h('span.pnl', null, h('b', { text: p.name }), h('span.faint', { text: ` Lv${p.level}` })),
        h('span.bestskill.pb', null, icon(best.icon, { size: 12 }), ` ${best.skill} ${Math.round(p.skills?.[best.id] ?? 0)}`)),
      h('span.pr', { style: { background: ROLES[p.role]?.color } }),
      h('span.small.muted.sufrom', { text: p.assignment.type === 'idle' ? 'Idle' : 'Maint.' }));
    toggleClass(el, 'on', true);
    return el;
  }

  function sync() {
    setText(countEl, `${picked.size} picked of ${pool.length} on maintenance or idle`);
    setText(goT, picked.size ? `Move ${picked.size} to ${projectLabel(ctx.getState(), proj)}` : 'Pick someone');
    go.disabled = !picked.size;
  }

  function commit() {
    let moved = 0;
    for (const id of picked) if (ctx.act({ type: 'assign', staffId: id, assignment: { type: 'project', targetId: projectId } }).ok) moved++;
    if (moved) { ctx.sfx('confirm'); ctx.toast(`${moved} ${moved === 1 ? 'person' : 'people'} moved to ${projectLabel(ctx.getState(), proj)}`, 'good'); }
    close?.();
  }

  const body = h('div.col.staffup', null,
    pool.length ? chipsEl : null,
    pool.length ? listEl : h('div.empty', { text: 'Nobody is on maintenance or idle right now.' }),
    h('div.row.wrap', null, countEl, h('span.spacer'), pool.length ? go : null));
  if (pool.length) render();
  close = ctx.openModal({ title: `Staff up: ${projectLabel(s0, proj)}`, iconName: 'menu.staff', body, cls: 'small' });
}
