// The Squads tab in Staff: one card per squad with its faces, posting, cohesion and after-launch rule,
// a card to form a new one, and small modals to pick members and to act on one member.
// Reads state only; every change is a dispatch through ctx.act, whose refusals toast their reason.
import { h, setText, setWidth, toggleClass } from '../dom.js';
import { B } from '../content.js';
import { portrait, roleChip, liveView, confirmButton } from '../widgets.js';
import { icon } from '../icons.js';
import { picker } from '../picker.js';
import { projectLabel, doingText, assignmentOptions } from './common.js';
import { SQUAD_NAMES } from '../../data/squads.js';

export const SQUAD_MAX = B.squadMax ?? 6;
export const SQUAD_MEMBERS_MAX = B.squadMaxMembers ?? 8;
const NAME_MAX = 20;

export const squadsUnlocked = (s) => s.unlocks?.squads != null;
export const squadOf = (s, staffId) => (s.squads ?? []).find((sq) => sq.memberIds.includes(staffId)) ?? null;
const first = (p) => p.name.split(' ')[0];

// Whether a member is doing what the squad is posted to. Upkeep crew are counted apart.
export function onPosting(sq, p) {
  const a = p.assignment ?? { type: 'idle' };
  if (a.type !== sq.posting.type) return false;
  return sq.posting.type !== 'project' || a.targetId === sq.posting.targetId;
}

// 'crew', 'away', 'posted' or 'loan' for one member.
export function memberStatus(sq, p) {
  if ((sq.crewIds ?? []).includes(p.id)) return 'crew';
  if (p.mood === 'away' || p.assignment?.type === 'sabbatical') return 'away';
  return onPosting(sq, p) ? 'posted' : 'loan';
}

const benched = (sq) => sq.posting.type === 'idle' && sq.benchUntil != null;

// The short pill after the squad's name.
export function postingText(s, sq) {
  const t = sq.posting.type;
  if (t === 'project') {
    const j = s.projects.find((x) => x.id === sq.posting.targetId);
    return { icon: 'project', text: `on ${j ? projectLabel(s, j) : 'a project'}`, tone: 'on' };
  }
  if (t === 'maintenance') return { icon: 'refresh', text: 'on Maintenance', tone: 'on' };
  if (t === 'support') return { icon: 'fn.support', text: 'on Support', tone: 'on' };
  if (benched(sq)) {
    const left = Math.max(1, sq.benchUntil - s.week);
    return { icon: 'sabbatical', text: `benched · ${left}w left`, tone: 'bench' };
  }
  return { icon: 'hourglass', text: 'idle', tone: 'idle' };
}

// Where a squad can be posted, as picker options. Maintenance needs an engineer in the squad.
function postOptions(s, sq, { projectsOnly = false } = {}) {
  const out = s.projects.map((j) => ({ value: `project:${j.id}`, label: projectLabel(s, j), icon: 'project', group: 'Projects' }));
  if (projectsOnly) return out;
  out.push({ value: 'maintenance:', label: 'Maintenance', icon: 'refresh', sub: 'Engineers keep the products running' });
  out.push({ value: 'support:', label: 'Support', icon: 'fn.support', sub: 'Answer customers' });
  out.push({ value: 'idle:', label: 'Stand down', icon: 'hourglass', sub: 'Idle until you post them' });
  return out;
}

const postingValue = (sq) => `${sq.posting.type}:${sq.posting.type === 'project' ? sq.posting.targetId ?? '' : ''}`;

// Posts the squad and says who stayed put and why.
export function postSquad(ctx, sq, value) {
  const [type, targetId] = value.split(':');
  const res = ctx.act({ type: 'postSquad', squadId: sq.id, posting: { type, targetId: type === 'project' ? targetId : null } });
  if (!res.ok) return res;
  ctx.sfx?.('confirm');
  const s = ctx.getState();
  const skipped = res.skipped ?? [];
  if (skipped.length) {
    const byReason = new Map();
    for (const k of skipped) {
      const p = s.staff.find((x) => x.id === k.staffId);
      if (!byReason.has(k.reason)) byReason.set(k.reason, []);
      byReason.get(k.reason).push(p ? first(p) : '?');
    }
    const why = [...byReason].map(([r, names]) => `${names.join(', ')}: ${r}`).join('. ');
    ctx.toast(`${sq.name} posted, ${res.placed.length} of ${res.placed.length + skipped.length}. ${why}`, 'warn');
  }
  return res;
}

// A name from SQUAD_NAMES no squad uses yet, after `after` in the list.
export function nextSquadName(s, after = '') {
  const used = new Set((s.squads ?? []).map((sq) => sq.name));
  const free = SQUAD_NAMES.filter((n) => !used.has(n));
  if (!free.length) return `Squad ${(s.squads?.length ?? 0) + 1}`;
  const i = free.indexOf(after);
  return free[(i + 1) % free.length];
}

// The member picker, shared by forming a squad and changing its members.
function openMembers(ctx, { sq = null } = {}) {
  const s = ctx.getState();
  const chosen = new Set(sq ? sq.memberIds : []);
  let name = sq ? sq.name : nextSquadName(s);
  let close = null;
  const count = h('b.num');
  const go = h('button.btn.go', { onclick: () => submit() }, sq ? 'Save members' : 'Form squad');
  const why = h('span.small.sqwhy');
  const nameInput = sq ? null : h('input.text.sqname', {
    value: name, maxlength: NAME_MAX, placeholder: 'Squad name', 'aria-label': 'Squad name',
    oninput: (e) => { name = e.target.value; refresh(); },
  });
  const rows = [...s.staff].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)).map((p) => {
    const other = squadOf(s, p.id);
    const tag = other && other.id !== sq?.id ? h('span.pill.tiny.sqin', { text: `in ${other.name}` }) : null;
    const tick = h('span.sqtick', null, icon('check', { size: 14 }));
    const row = h('button.sqpick', { type: 'button', onclick: () => { if (chosen.has(p.id)) chosen.delete(p.id); else chosen.add(p.id); refresh(); } },
      tick, portrait(p, 32),
      h('span.sqpmain', null, h('span.sqptop', null, h('b', { text: p.name }), roleChip(p.role)), h('span.small.muted', { text: doingText(s, p) })),
      tag);
    row.dataset.id = p.id;
    return row;
  });
  function problem() {
    if (!sq && !name.trim()) return 'Name the squad';
    if (!chosen.size) return 'Pick at least one person';
    if (chosen.size > SQUAD_MEMBERS_MAX) return `A squad has 1 to ${SQUAD_MEMBERS_MAX} people`;
    return null;
  }
  function refresh() {
    for (const r of rows) toggleClass(r, 'on', chosen.has(r.dataset.id));
    setText(count, `${chosen.size} of ${SQUAD_MEMBERS_MAX}`);
    toggleClass(count, 'over', chosen.size > SQUAD_MEMBERS_MAX);
    const bad = problem();
    go.disabled = !!bad;
    setText(why, bad ?? (sq ? '' : 'Joining moves people out of their old squad.'));
    toggleClass(why, 'bad', !!bad);
  }
  function submit() {
    const memberIds = s.staff.map((p) => p.id).filter((id) => chosen.has(id));
    const res = sq
      ? ctx.act({ type: 'setSquadMembers', squadId: sq.id, memberIds })
      : ctx.act({ type: 'createSquad', name: name.trim(), memberIds });
    if (res.ok) { ctx.sfx?.('confirm'); close?.(); }
  }
  const body = h('div.sqmembers', null,
    nameInput ? h('div.row.sqnamerow', null, nameInput,
      h('button.btn.small', { type: 'button', title: 'Suggest a name', onclick: () => { name = nextSquadName(ctx.getState(), name); nameInput.value = name; refresh(); } }, icon('dice'), ' Suggest')) : null,
    h('div.row.small', null, h('span', { text: 'People: ' }), count, h('span.spacer'), h('span.muted', { text: 'Tap to add or remove' })),
    h('div.sqpicklist', null, ...rows),
    h('div.row.sqfoot', null, why, h('span.spacer'), go));
  refresh();
  close = ctx.openModal({ title: sq ? `${sq.name}: members` : 'New squad', iconName: 'team', body, cls: 'squads' });
}

function openRename(ctx, sq) {
  let name = sq.name;
  let close = null;
  const input = h('input.text.sqname', { value: name, maxlength: NAME_MAX, 'aria-label': 'Squad name', oninput: (e) => { name = e.target.value; } });
  const save = () => { if (ctx.act({ type: 'renameSquad', squadId: sq.id, name: name.trim() }).ok) { ctx.sfx?.('confirm'); close?.(); } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  const body = h('div.sqmembers', null,
    h('div.row.sqnamerow', null, input,
      h('button.btn.small', { type: 'button', title: 'Suggest a name', onclick: () => { name = nextSquadName(ctx.getState(), name); input.value = name; } }, icon('dice'), ' Suggest')),
    h('div.row.sqfoot', null, h('span.spacer'), h('button.btn.go', { onclick: save }, 'Rename')));
  close = ctx.openModal({ title: `Rename ${sq.name}`, iconName: 'update', body, cls: 'squads small' });
}

// One member: lead, move to another squad, lend out (their own assignment), leave, or open their card.
function openMember(ctx, sqId, staffId, openCard) {
  const s = ctx.getState();
  const sq = s.squads.find((x) => x.id === sqId);
  const p = s.staff.find((x) => x.id === staffId);
  if (!sq || !p) return;
  let close = null;
  const done = (res) => { if (res.ok) { ctx.sfx?.('confirm'); close?.(); } };
  const st = memberStatus(sq, p);
  const status = { crew: 'On upkeep: looking after the product they launched.', away: 'Away right now.',
    posted: `Working the squad's posting.`, loan: 'On loan: doing other work. They rejoin when you post the squad.' }[st];
  const lead = sq.leadId === p.id
    ? h('button.btn.small', { onclick: () => done(ctx.act({ type: 'setSquadLead', squadId: sq.id, staffId: null })) }, 'Stop leading')
    : h('button.btn.small.primary', { onclick: () => done(ctx.act({ type: 'setSquadLead', squadId: sq.id, staffId: p.id })) }, icon('star', { size: 14 }), ' Make lead');
  const others = s.squads.filter((x) => x.id !== sq.id);
  const move = picker({
    key: `sqmove:${p.id}`, placeholder: others.length ? 'Move to squad...' : 'No other squad', keepValue: false, disabled: !others.length, title: 'Move them to another squad',
    options: others.map((x) => ({ value: x.id, label: x.name, sub: `${x.memberIds.length} of ${SQUAD_MEMBERS_MAX}`, icon: 'team', disabled: x.memberIds.length >= SQUAD_MEMBERS_MAX })),
    onChange: (id) => { const to = s.squads.find((x) => x.id === id); const res = ctx.act({ type: 'setSquadMembers', squadId: id, memberIds: [...to.memberIds, p.id] }); done(res); return res; },
  }).el;
  const lend = picker({
    key: `sqlend:${p.id}`, placeholder: 'Lend out to...', keepValue: false, title: 'Give them other work; they stay in the squad',
    disabled: st === 'away',
    options: assignmentOptions(s, p).filter((o) => o.group !== 'Current'),
    onChange: (v, o) => { const res = ctx.act({ type: 'assign', staffId: p.id, assignment: { type: o.type, targetId: o.targetId } }); done(res); return res; },
  }).el;
  const leave = h('button.btn.small.danger', {
    onclick: () => done(ctx.act({ type: 'setSquadMembers', squadId: sq.id, memberIds: sq.memberIds.filter((id) => id !== p.id) })),
  }, 'Leave squad');
  const body = h('div.sqmember', null,
    h('div.row', null, portrait(p, 56), h('div', null, h('b', { text: p.name }), h('div.row.wrap', null, roleChip(p.role), h('span.small.muted', { text: `Lv${p.level}` })),
      h('div.small', { text: doingText(s, p) }))),
    h('div.small.muted', { text: status }),
    h('div.sqacts', null, lead, move, lend, leave,
      h('button.btn.small.blue', { onclick: () => { close?.(); openCard(p.id); } }, 'Open their card')));
  close = ctx.openModal({ title: `${first(p)} in ${sq.name}`, iconName: 'team', body, cls: 'squads small' });
}

export function squadsView(ctx, { openCard }) {
  let focusId = null;
  const cards = new Map();

  const sig = (s) => [s.staff.length, (s.squads ?? []).map((sq) => (benched(sq) ? sq.benchUntil - s.week : '')).join(), s.projects.map((j) => `${j.id}${j.name}`).join(),
    ...(s.squads ?? []).map((sq) => [sq.id, sq.name, sq.memberIds.join(), sq.leadId, postingValue(sq), sq.afterLaunch, sq.benchUntil, (sq.crewIds ?? []).join(),
      sq.memberIds.map((id) => { const p = s.staff.find((x) => x.id === id); return p ? `${p.assignment.type}${p.assignment.targetId}${p.mood}` : ''; }).join()].join('/'))].join('|');

  const view = liveView(sig, (s, bind) => {
    cards.clear();
    const list = s.squads ?? [];
    const out = list.map((sq) => squadCard(s, sq, bind));
    out.push(newCard(s));
    return [h('div.sqintro.small.muted', { text: 'Squads work as a unit. Post a squad and everyone who can goes; the longer they work together, the faster they get.' }),
      h('div.sqgrid', null, ...out)];
  });

  function newCard(s) {
    const full = (s.squads?.length ?? 0) >= SQUAD_MAX;
    return h('div.sqcard.sqnew', null,
      h('button.btn.go', { disabled: full, onclick: () => openMembers(ctx) }, '+ New squad'),
      h('div.small.muted', null, full ? `Up to ${SQUAD_MAX} squads. Disband one to form another.` : `Pick up to ${SQUAD_MEMBERS_MAX} people · `, full ? null : icon('dice', { size: 13 }), full ? null : ' suggests a name'));
  }

  function face(s, sq, p) {
    const st = memberStatus(sq, p);
    const tag = { crew: 'upkeep', loan: 'on loan', away: 'away' }[st];
    const el = h('button.sqface', { type: 'button', title: `${p.name}: ${doingText(s, p)}`, onclick: () => openMember(ctx, sq.id, p.id, openCard) },
      h('span.sqpic', null, portrait(p, 40), sq.leadId === p.id ? h('span.sqstar', { title: 'Squad lead' }, icon('star', { size: 14 })) : null),
      h('span.sqfn', { text: first(p) }),
      tag ? h(`span.sqtag.${st}`, { text: tag }) : null);
    toggleClass(el, st, true);
    return el;
  }

  function squadCard(s, sq, bind) {
    const members = sq.memberIds.map((id) => s.staff.find((p) => p.id === id)).filter(Boolean);
    const status = new Map(members.map((p) => [p.id, memberStatus(sq, p)]));
    const posted = members.filter((p) => status.get(p.id) === 'posted').length;
    const crew = members.filter((p) => status.get(p.id) === 'crew');
    const loan = members.filter((p) => status.get(p.id) === 'loan');
    const pt = postingText(s, sq);
    const isBench = benched(sq);

    const head = h('div.sqhead', null,
      h('button.sqtitle', { type: 'button', title: 'Rename', onclick: () => openRename(ctx, sq) }, sq.name),
      h(`span.pill.sqpost.${pt.tone}`, null, icon(pt.icon, { size: 13 }), ` ${pt.text}`),
      h('span.spacer'),
      sq.posting.type === 'idle' ? null : h('span.small.muted', { text: `${posted} of ${members.length} posted` }),
      moreButton(sq));

    const faces = h('div.sqfaces', null, ...members.map((p) => face(s, sq, p)),
      h('button.btn.small.sqedit', { type: 'button', title: 'Add or remove people', onclick: () => openMembers(ctx, { sq }) }, '+ / -'));

    const notes = [];
    if (!members.length) notes.push('Nobody left in this squad. Add people or disband it.');
    if (loan.length && sq.posting.type !== 'idle') notes.push(`${loan.map(first).join(', ')} ${loan.length === 1 ? 'is' : 'are'} on loan · ${loan.length === 1 ? 'rejoins' : 'rejoin'} next posting`);
    if (crew.length) {
      const prodOf = s.flags?.crewProduct ?? {};
      const names = [...new Set(crew.map((p) => s.products.find((x) => x.id === prodOf[p.id])?.name).filter(Boolean))];
      notes.push(`Upkeep crew${names.length ? ` on ${names.join(', ')}` : ''}: ${crew.map(first).join(', ')}`);
    }

    // Cohesion changes weekly without anything else changing, so it's bound rather than rebuilt.
    const cFill = h('i', { style: { background: '#3fb6b0' } });
    const cVal = h('span.num.small');
    bind((st) => {
      const cur = st.squads?.find((x) => x.id === sq.id);
      if (!cur) return;
      setWidth(cFill, cur.cohesion);
      setText(cVal, `+${(cur.cohesion * (B.squadCohesionOutput ?? 0.05) * 100).toFixed(1)}%`);
    });
    const cohesion = h('div.sqcoh', { title: 'Cohesion builds each week at least half the squad works its posting. Members on the posting get this much extra output.' },
      h('span.small', { text: 'Cohesion' }), h('div.bar', null, cFill), cVal);

    const parts = [head];
    if (isBench) {
      parts.push(h('div.sqbanner', { text: `${sq.name} is free: start something. In ${Math.max(1, sq.benchUntil - s.week)} week${sq.benchUntil - s.week === 1 ? '' : 's'} they drop back to their usual work.` }));
    }
    parts.push(faces, ...notes.map((t) => h('div.small.muted.sqnote', { text: t })), cohesion);

    if (isBench) {
      const projOpts = postOptions(s, sq, { projectsOnly: true });
      parts.push(h('div.sqrow', null,
        h('button.btn.go', { onclick: () => ctx.open('build') }, icon('launch', { size: 16 }), ' Start a product'),
        picker({ key: `sqproj:${sq.id}`, placeholder: projOpts.length ? 'Post to project...' : 'No projects yet', keepValue: false, disabled: !projOpts.length,
          className: 'sqpostpick', title: 'Post the squad to a project', options: projOpts, onChange: (v) => postSquad(ctx, sq, v) }).el,
        h('button.btn', { onclick: () => postSquad(ctx, sq, 'maintenance:') }, 'Maintenance')));
    } else {
      const seg = h('div.seg.sqafter', { role: 'group', 'aria-label': 'After launch' },
        ...[['upkeep', 'Keep upkeep crew'], ['maintenance', 'Everyone to maintenance']].map(([mode, label]) => {
          const b = h('button.segb', { type: 'button', onclick: () => { if (sq.afterLaunch !== mode && ctx.act({ type: 'setSquadAfterLaunch', squadId: sq.id, mode }).ok) ctx.sfx?.('click'); } }, label);
          toggleClass(b, 'on', sq.afterLaunch === mode);
          return b;
        }));
      parts.push(h('div.sqafterrow', { title: 'When their project ships: keep the engineers who know it most on upkeep and bench the rest for two weeks, or send everyone to maintenance.' },
        h('span.small', { text: 'After launch' }), seg));
      let choice = postingValue(sq);
      const pk = picker({ key: `sqpost:${sq.id}`, value: choice, className: 'sqpostpick', title: 'Where the squad works', options: postOptions(s, sq), onChange: (v) => { choice = v; } });
      parts.push(h('div.sqrow', null, pk.el,
        h('button.btn.blue', { onclick: () => postSquad(ctx, sq, choice) }, 'Post squad')));
    }
    const card = h('div.sqcard', null, ...parts);
    card.dataset.squad = sq.id;
    cards.set(sq.id, card);
    return card;
  }

  function moreButton(sq) {
    return picker({
      key: `sqmore:${sq.id}`, placeholder: '...', keepValue: false, className: 'sqmore', title: 'More',
      options: [{ value: 'rename', label: 'Rename', icon: 'update' }, { value: 'members', label: 'Add or remove people', icon: 'team' },
        { value: 'disband', label: 'Disband', icon: 'letgo', sub: 'Everyone keeps their current work' }],
      onChange: (v) => {
        if (v === 'rename') openRename(ctx, sq);
        else if (v === 'members') openMembers(ctx, { sq });
        else if (v === 'disband') openDisband(sq);
      },
    }).el;
  }

  function openDisband(sq) {
    let close = null;
    const body = h('div.sqmember', null,
      h('div', { text: `Disband ${sq.name}? Everyone keeps their current work, and the squad's cohesion is lost.` }),
      h('div.row.sqfoot', null, h('span.spacer'),
        confirmButton('Disband', 'Really? Tap again', 'danger', () => { if (ctx.act({ type: 'disbandSquad', squadId: sq.id }).ok) { ctx.sfx?.('confirm'); close?.(); } })));
    close = ctx.openModal({ title: `Disband ${sq.name}`, iconName: 'team', body, cls: 'squads small' });
  }

  function focus(id) {
    focusId = id ?? null;
    if (!focusId) return;
    requestAnimationFrame(() => {
      const c = cards.get(focusId);
      if (!c) return;
      c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      c.classList.remove('flash');
      void c.offsetWidth;
      c.classList.add('flash');
    });
  }

  return { el: view.el, update: view.update, focus };
}
