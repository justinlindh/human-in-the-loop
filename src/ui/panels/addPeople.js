// Add people to a running project: the squad strip over a list of everyone who could come. Ticked people
// are assigned one by one; a squad chip only ticks its members who can come.
import { h, setText, toggleClass } from '../dom.js';
import { ROLES } from '../content.js';
import { portrait } from '../widgets.js';
import { icon } from '../icons.js';
import { createSquadStrip } from '../squadPick.js';
import { isAvailable, projectLabel, assignmentText } from './common.js';

export function openAddPeople(ctx, projectId) {
  const s0 = ctx.getState();
  const proj = s0.projects.find((j) => j.id === projectId);
  if (!proj) return;
  const pool = s0.staff.filter((p) => isAvailable(p) && !(p.assignment.type === 'project' && p.assignment.targetId === projectId));
  const picked = new Set();
  const rows = new Map();
  const countEl = h('span.small.muted');
  const goT = h('span');
  const go = h('button.btn.go.big', { onclick: () => commit() }, icon('launch'), ' ', goT);
  let close = null;

  function refresh() {
    for (const [id, r] of rows) { toggleClass(r.row, 'on', picked.has(id)); setText(r.tag, strip.squadOf(id)?.name ?? ''); }
    setText(countEl, `${picked.size} picked of ${pool.length}`);
    setText(goT, picked.size ? `Add ${picked.size} to ${projectLabel(ctx.getState(), proj)}` : 'Pick someone');
    go.disabled = !picked.size;
    strip.refresh();
  }
  const strip = createSquadStrip({ ctx, picked, pool, targetProjectId: projectId, onChange: refresh });

  const list = h('div.picker.sulist', null, ...pool.map((p) => {
    const tag = h('span.sqtag');
    const row = h('button.pick', { type: 'button', title: assignmentText(s0, p), onclick: () => { if (picked.has(p.id)) picked.delete(p.id); else picked.add(p.id); refresh(); } },
      h('span.check', null, icon('check')), portrait(p, 30),
      h('span.pn', null, h('span.pnl', null, h('b', { text: p.name }), h('span.faint', { text: ` Lv${p.level}` })), h('span.small.faint', { text: assignmentText(s0, p) })),
      h('span.pr', { style: { background: ROLES[p.role]?.color } }), tag);
    rows.set(p.id, { row, tag });
    return row;
  }));

  function commit() {
    let added = 0;
    for (const id of picked) if (ctx.act({ type: 'assign', staffId: id, assignment: { type: 'project', targetId: projectId } }).ok) added++;
    if (added) { ctx.sfx('confirm'); ctx.toast(`${added} ${added === 1 ? 'person' : 'people'} added to ${projectLabel(ctx.getState(), proj)}`, 'good'); }
    close?.();
  }

  const body = h('div.col.staffup', null, strip.el, pool.length ? list : h('div.empty', { text: 'Everyone available is already on this project.' }),
    h('div.row.wrap', null, countEl, h('span.spacer'), pool.length ? go : null));
  refresh();
  close = ctx.openModal({ title: `Add people: ${projectLabel(s0, proj)}`, iconName: 'menu.staff', body });
}
