// Squads in the project pickers (#1909): a strip of chips above a people list. One tap ticks every member who
// can come; a chevron opens who cannot and why; the After launch rule can be flipped without leaving.
// The strip only ticks people in a shared Set; the picker that owns the Set decides what the ticks do.
import { h, toggleClass } from './dom.js';
import { portrait } from './widgets.js';
import { icon } from './icons.js';
import { projectLabel } from './panels/common.js';

const first = (p) => p.name.split(' ')[0];

// How one squad member stands for a posting to targetProjectId:
// { kind: 'ok' | 'moves' | 'here' | 'crew' | 'away', text, comes } where comes says the chip would tick them.
// The target is always a project, which takes any role, so the squad's current posting never blocks anyone.
export function memberStand(s, sq, p, targetProjectId) {
  if (p.mood === 'away' || p.assignment?.type === 'sabbatical') return { kind: 'away', text: 'away', comes: false };
  if ((sq.crewIds ?? []).includes(p.id)) {
    const prod = (s.products ?? []).find((x) => x.id === p.assignment?.targetId);
    return { kind: 'crew', text: `upkeep: stays on ${prod?.name ?? 'its product'}`, comes: false };
  }
  const a = p.assignment ?? { type: 'idle' };
  if (a.type === 'project' && a.targetId === targetProjectId) return { kind: 'here', text: 'already on this project', comes: false };
  if (a.type === 'project') {
    const j = (s.projects ?? []).find((x) => x.id === a.targetId);
    return { kind: 'moves', text: `moves from ${j ? projectLabel(s, j) : 'another project'}`, comes: true };
  }
  return { kind: 'ok', text: '', comes: true };
}

// The chip's own summary for a squad: who comes, who does not, and the reason when nobody can.
export function squadStand(s, sq, targetProjectId) {
  const members = sq.memberIds.map((id) => (s.staff ?? []).find((p) => p.id === id)).filter(Boolean);
  const stands = members.map((p) => ({ p, ...memberStand(s, sq, p, targetProjectId) }));
  const comers = stands.filter((x) => x.comes);
  const firstNo = stands.find((x) => !x.comes && x.kind !== 'here');
  const reason = !comers.length ? (firstNo ? `${first(firstNo.p)}: ${firstNo.text}` : 'Everyone is already here') : null;
  return { stands, comers, reason };
}

// pool: the people the list below shows (a squad member outside it cannot be ticked). picked: the shared Set of
// ticked ids. onChange runs after the Set changes so the owner can redraw its rows and count.
export function createSquadStrip({ ctx, picked, pool, targetProjectId = null, onChange }) {
  const open = new Set(); // squad ids with their breakdown open
  const chosen = new Set(); // squad ids whose chip is on
  const root = h('div.sqpick');
  const inPool = (id) => pool.some((p) => p.id === id);

  const tickedOf = (stand) => stand.comers.filter((x) => picked.has(x.p.id));

  function toggle(sq) {
    const st = squadStand(ctx.getState(), sq, targetProjectId);
    const ids = st.comers.map((x) => x.p.id).filter(inPool);
    if (chosen.has(sq.id)) { chosen.delete(sq.id); for (const id of ids) picked.delete(id); } else { chosen.add(sq.id); for (const id of ids) picked.add(id); }
    ctx.sfx?.('click');
    onChange();
    render();
  }

  function breakdown(s, sq, st) {
    const rows = st.stands.map((x) => h('div.sqrow', { class: x.kind },
      portrait(x.p, 22), h('b.small', { text: first(x.p) }),
      x.kind === 'ok' ? h('span.small.faint', { text: picked.has(x.p.id) ? 'comes' : '' }) : h('span.sqwhy', { class: x.kind, text: x.text })));
    const mode = sq.afterLaunch ?? 'upkeep';
    // One row: the label, then the two options as a single segmented control of equal halves.
    const seg = h('div.sqseg', { role: 'group', 'aria-label': 'After launch' },
      ...[['upkeep', 'Upkeep'], ['maintenance', 'Maintenance']].map(([m, label]) => {
        const b = h('button.sqsegb', { type: 'button', title: m === 'upkeep' ? 'Keep the engineers who know the product on upkeep and bench the rest for two weeks' : 'Send everyone to maintenance', onclick: () => { if (ctx.act({ type: 'setSquadAfterLaunch', squadId: sq.id, mode: m }).ok) render(); } }, label);
        toggleClass(b, 'on', mode === m);
        b.setAttribute('aria-pressed', mode === m ? 'true' : 'false');
        return b;
      }));
    const after = h('div.sqafter', null, h('span.small.muted.sqafterlbl', { text: 'After launch' }), seg);
    return h('div.sqbreak', null, ...rows, after);
  }

  function render() {
    const s = ctx.getState();
    const squads = s.squads ?? [];
    if (!squads.length) { root.replaceChildren(); return; }
    const chips = squads.map((sq) => {
      const st = squadStand(s, sq, targetProjectId);
      const lead = (s.staff ?? []).find((p) => p.id === sq.leadId);
      const can = st.comers.length;
      const ticked = tickedOf(st).length;
      const on = chosen.has(sq.id) && ticked > 0;
      const near = !on && ticked > 0 && ticked * 2 >= sq.memberIds.length;
      const elsewhere = sq.posting?.type === 'project' && sq.posting.targetId !== targetProjectId ? (s.projects ?? []).find((j) => j.id === sq.posting.targetId) : null;
      const count = `${on || near ? `${ticked} of ${sq.memberIds.length}` : `${can} of ${sq.memberIds.length} can come`}${elsewhere ? ` · on ${projectLabel(s, elsewhere)}` : ''}`;
      const main = h('button.sqchipmain', { type: 'button', disabled: !can, title: st.reason ?? '', onclick: () => toggle(sq) },
        lead ? portrait(lead, 26) : icon('team', { size: 18 }),
        h('span.sqtxt', null, h('b', { text: sq.name }),
          h('span.small.sqcount', { text: st.reason ?? count }),
          h('span.sqcoh', null, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, sq.cohesion ?? 0)) * 100)}%` } }))));
      const chev = h('button.sqchev', { type: 'button', 'aria-label': `Who can come from ${sq.name}`, 'aria-expanded': open.has(sq.id) ? 'true' : 'false',
        onclick: () => { if (open.has(sq.id)) open.delete(sq.id); else open.add(sq.id); render(); } }, icon(open.has(sq.id) ? 'caret.down' : 'caret.right', { size: 14 }));
      const chip = h('div.sqchip', { class: `${on ? 'on' : ''} ${can ? '' : 'off'}`.trim() }, main, chev);
      return { chip, sq, st, near, ticked };
    });
    const strip = h('div.sqstrip', null, ...chips.map((c) => c.chip));
    const hints = chips.filter((c) => c.near).map((c) => h('div.small.sqhint', { text: `${c.sq.name}: ${c.ticked} of ${c.sq.memberIds.length} picked. Tap the chip to post as a squad.` }));
    const opened = chips.filter((c) => open.has(c.sq.id)).map((c) => breakdown(s, c.sq, c.st));
    root.replaceChildren(strip, ...hints, ...opened);
  }

  render();
  return {
    el: root,
    // The owner changed the Set by hand (a row tap): chips re-read their counts.
    refresh() { for (const id of [...chosen]) { const sq = (ctx.getState().squads ?? []).find((q) => q.id === id); if (!sq || !tickedOf(squadStand(ctx.getState(), sq, targetProjectId)).length) chosen.delete(id); } render(); },
    // The squad whose chip put this ticked person in the list, for the stripe on their row.
    squadOf(id) { return picked.has(id) ? (ctx.getState().squads ?? []).find((q) => chosen.has(q.id) && q.memberIds.includes(id)) ?? null : null; },
    // What confirming does: the squads to post (with who to leave off) and the people to assign by hand.
    plan() { return postPlan(ctx.getState(), picked, chosen, targetProjectId); },
  };
}

// The squads whose chip is on post as squads, leaving off the members who could come but were unticked;
// everyone else ticked is assigned as a person.
export function postPlan(s, picked, chosen, targetProjectId) {
  const squads = [];
  const covered = new Set();
  for (const sq of s.squads ?? []) {
    if (!chosen.has(sq.id)) continue;
    const st = squadStand(s, sq, targetProjectId);
    const ticked = st.comers.filter((x) => picked.has(x.p.id));
    if (!ticked.length) continue;
    // Left off: members who could come but were unticked, and those already on this project (re-posting them
    // would only inflate the count).
    squads.push({ squadId: sq.id, exclude: st.stands.filter((x) => x.kind === 'here' || (x.comes && !picked.has(x.p.id))).map((x) => x.p.id) });
    for (const x of ticked) covered.add(x.p.id);
  }
  return { squads, people: [...picked].filter((id) => !covered.has(id)) };
}

// Runs a plan against a project. Returns how many people ended up on it and how many were asked for.
export function commitPlan(ctx, plan, projectId, wanted) {
  let placed = 0;
  for (const q of plan.squads) {
    const res = ctx.act({ type: 'postSquad', squadId: q.squadId, posting: { type: 'project', targetId: projectId }, ...(q.exclude.length ? { exclude: q.exclude } : {}) });
    if (res.ok) placed += res.placed?.length ?? 0;
  }
  for (const id of plan.people) if (ctx.act({ type: 'assign', staffId: id, assignment: { type: 'project', targetId: projectId } }).ok) placed++;
  return { placed, wanted };
}
