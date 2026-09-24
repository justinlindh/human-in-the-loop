import { h, setText, setWidth, fmtMoney, toggleClass } from '../dom.js';
import { B, MOOD_INFO, capacityOf, traitInfo, roleName } from '../content.js';
import { portrait, portraitLive, roleChip, seniorityChip, traitChips, liveView, tabs, confirmButton, sparkline, moodColor } from '../widgets.js';
import { assignmentOptions, assignmentText, mentorOf, isAvailable } from './common.js';
import { icon } from '../icons.js';
import { STATS, STAT, strengthChip } from '../stats.js';
import { hireView } from './hire.js';
import { PATHS } from '../../data/paths.js';
import { TRAINING } from '../../data/training.js';
import { meaningShown, TIRED_STAMINA, emptyWeeks, EMPTY_WARN_WEEKS } from '../v2content.js';

// Career path picker for a senior with pathPending.
export function openPathPicker(ctx, staffId) {
  const p = ctx.getState().staff.find((x) => x.id === staffId);
  if (!p) return;
  const paths = Object.values(PATHS).filter((x) => x.role === p.role);
  let close = null;
  const body = h('div.pathpick', null,
    h('div.row', null, portrait(p, 56), h('div', null, h('b', { text: p.name }),
      h('div.small.muted', { text: `Senior ${roleName(p.role)}. Pick one path; it stays with them. At level 20 they become a Legend and the perk grows by a quarter.` }))),
    h('div.pathcards', null, ...paths.map((path) => h('button.pathcard', {
      onclick: () => { if (ctx.act({ type: 'choosePath', staffId: p.id, pathId: path.id }).ok) { ctx.sfx('confirm'); close?.(); } },
    }, h('b.pname', null, icon('path', { size: 14 }), ` ${path.name}`), h('span.small', { text: path.desc }), h('span.pick', { text: 'Choose' })))));
  close = ctx.openModal({ title: 'Choose a career path', iconName: 'path', body, cls: 'paths' });
}

// Training program picker; the workshop needs a skill focus.
export function openTraining(ctx, staffId) {
  const p = ctx.getState().staff.find((x) => x.id === staffId);
  if (!p) return;
  let focus = STATS.reduce((lo, st) => (p.skills[st.id] < p.skills[lo] ? st.id : lo), 'features');
  let close = null;
  const cards = Object.values(TRAINING).map((t) => {
    const lines = [`+${t.xp} XP`];
    if (t.skill) lines.push(`+${t.skill} to one skill`);
    if (t.meaning) lines.push(`+${t.meaning} meaning`);
    if (t.knowledge) lines.push(`+${t.knowledge} know-how`);
    if (t.brand) lines.push('a little brand');
    const focusSel = t.skill ? h('select', { onchange: (e) => { focus = e.target.value; } },
      ...STATS.map((st) => h('option', { value: st.id, text: `Focus: ${st.skill} (${p.skills[st.id]})` }))) : null;
    if (focusSel) focusSel.value = focus;
    const go = h('button.btn.small.blue', {
      onclick: () => {
        const res = ctx.act({ type: 'train', staffId: p.id, program: t.id, focus: t.skill ? focus : undefined });
        if (res.ok) { ctx.sfx('coin'); close?.(); }
      },
    }, `Send · ${fmtMoney(t.cost)}`);
    const why = h('span.why.small');
    const st = ctx.getState();
    if (st.cash < t.cost) { go.disabled = true; setText(why, 'Not enough cash'); }
    return h('div.card.trcard', null,
      h('div.row', null, icon(`train.${t.id}`), h('b', { text: t.name }), h('span.spacer'),
        h('span', { class: t.awayWeeks ? 'pill warn' : 'pill good', text: t.awayWeeks ? `Away ${t.awayWeeks}w` : 'No time away' })),
      h('div.small.muted', { text: t.desc }),
      h('div.small', { text: lines.join(' · ') }),
      focusSel,
      h('div.row', null, why, h('span.spacer'), go));
  });
  const body = h('div', null,
    h('div.row', null, portrait(p, 44), h('b', { text: `Train ${p.name}` }), h('span.spacer'), h('span.small.muted', { text: `Lv ${p.level}` })),
    h('div.trcards', null, ...cards));
  close = ctx.openModal({ title: 'Training', iconName: 'training', body, cls: 'training' });
}

function pathBadge(p) {
  if (p.pathPending) return h('span.pill.pathpend.tiny', { title: 'Ready to choose a career path' }, icon('path', { size: 11 }), ' Pick path');
  if (!p.path) return null;
  return h('span.pill.pathb.tiny', { title: PATHS[p.path]?.desc ?? '' }, p.legend ? icon('legend', { size: 11 }) : null, `${p.legend ? ' Legend ' : ''}${PATHS[p.path]?.name ?? p.path}`);
}

const SEN_ORDER = { junior: 0, mid: 1, senior: 2 };
const COLS = [
  { id: 'name', label: 'Name', key: (p) => p.name },
  { id: 'role', label: 'Role', key: (p) => p.role },
  { id: 'level', label: 'Level', key: (p) => SEN_ORDER[p.seniority] * 100 + p.level },
  { id: 'best', label: 'Best at', key: (p) => STATS.findIndex((x) => x.id === STATS.reduce((m, y) => ((p.skills?.[y.id] ?? 0) > (p.skills?.[m.id] ?? 0) ? y : m), STATS[0]).id) },
  { id: 'meaning', label: 'Meaning', key: (p) => p.meaning },
  { id: 'knowledge', label: 'Know-how', key: (p) => p.knowledge },
  { id: 'assignment', label: 'Doing', key: (p) => p.assignment.type },
  { id: 'traits', label: 'Traits', key: (p) => p.traits.length },
];

function assignSelect(ctx, s, p) {
  const opts = assignmentOptions(s, p);
  const cur = `${p.assignment.type}:${p.assignment.targetId ?? ''}`;
  const groups = {};
  for (const o of opts) (groups[o.group] ??= []).push(o);
  const sel = h('select.assign', {
    disabled: p.mood === 'away',
    onclick: (e) => e.stopPropagation(),
    onchange: (e) => {
      const o = opts.find((x) => x.value === e.target.value);
      e.target.blur();
      if (!o) return;
      const res = ctx.act({ type: 'assign', staffId: p.id, assignment: { type: o.type, targetId: o.targetId } });
      if (!res.ok) e.target.value = cur;
    },
  }, ...Object.entries(groups).map(([g, list]) => h('optgroup', { label: g }, ...list.map((o) => h('option', { value: o.value, text: o.label })))));
  sel.value = cur;
  return sel;
}

export function staffPanel(ctx, arg) {
  let tab = arg?.tab === 'hire' ? 'hire' : 'team';
  let detailId = arg?.staffId ?? null;
  let sort = { col: 'role', dir: 1 };

  const t = tabs([{ id: 'team', icon: 'menu.staff', label: 'Team' }, { id: 'hire', icon: 'hire', label: 'Hire' }], tab, (id) => { tab = id; detailId = null; t.set(id); render(); });
  const host = h('div');

  const table = liveView(
    (s) => [sort.col, sort.dir, meaningShown(s), s.projects.map((j) => j.id).join(), s.policies?.sabbatical ? 1 : 0,
      s.staff.map((p) => `${p.id}${p.assignment.type}${p.assignment.targetId}${p.mood}${p.seniority}${p.level}${p.path}${p.pathPending}${p.legend}${p.remote ? 'r' : ''}`).join()].join('|'),
    (s, bind) => renderTable(s, bind));
  const detail = liveView(
    (s) => { const p = s.staff.find((x) => x.id === detailId); return p ? [p.id, p.assignment.type, p.assignment.targetId, p.mood, p.level, p.seniority, p.path, p.pathPending, p.legend, p.traits.join(), s.projects.length, s.staff.length, s.policies?.sabbatical ? 1 : 0, s.week].join('|') : 'gone'; },
    (s, bind) => renderDetail(s, bind));
  const hire = hireView(ctx);

  function render() {
    const v = tab === 'hire' ? hire : detailId ? detail : table;
    host.replaceChildren(v.el);
    v.update(ctx.getState(), true);
  }

  function renderTable(s, bind) {
    // Before Meaning is revealed, the column shows energy (stamina) with a tired marker.
    const showM = meaningShown(s);
    const cols = COLS.map((c) => (c.id === 'meaning' && !showM ? { ...c, label: 'Energy', key: (p) => p.stamina ?? 0 } : c));
    const head = h('tr', null, ...cols.map((c) => {
      const th = h('th', { onclick: () => { sort = sort.col === c.id ? { col: c.id, dir: -sort.dir } : { col: c.id, dir: c.id === 'meaning' ? 1 : 1 }; table.update(ctx.getState(), true); } },
        c.label, sort.col === c.id ? h('span.sort', null, ' ', icon(sort.dir > 0 ? 'sort.up' : 'sort.down')) : null);
      toggleClass(th, 'on', sort.col === c.id);
      return th;
    }));
    const col = cols.find((c) => c.id === sort.col);
    const rows = [...s.staff].sort((a, b) => {
      const ka = col.key(a), kb = col.key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir || a.name.localeCompare(b.name);
    });
    const body = h('tbody');
    for (const p of rows) {
      const tired = h('span.tired', { title: 'Running low on energy' }, icon('battery.low', { size: 16 }));
      const mFill = h('i');
      const mVal = h('span.num');
      const kFill = h('i', { style: { background: '#3fb6b0' } });
      const kVal = h('span.num');
      const tr = h('tr', { onclick: () => { detailId = p.id; render(); }, title: 'Click for details' },
        h('td.nm', null, h('div.row', null, portrait(p, 30), h('div', null, h('b', { text: p.name }), p.founder ? h('span.pill.ink.tiny', { text: 'Founder' }) : null,
          p.remote ? h('span.pill.tiny.remote', { title: 'Working from home this week' }, icon('home', { size: 11 }), ' Home') : null, pathBadge(p)))),
        h('td', null, roleChip(p.role)),
        h('td', null, seniorityChip(p.seniority), h('span.num.lv', { text: ` Lv${p.level}` })),
        h('td.bestcol', null, bestChip(p)),
        h('td.mcol', { title: MOOD_INFO[p.mood]?.name }, h('div.row', null, h('span.mico', null, icon(`mood.${p.mood}`, { size: 19 })), h('div.bar', null, mFill), mVal, tired)),
        h('td.kcol', null, h('div.row', null, h('div.bar', null, kFill), kVal)),
        h('td', null, assignSelect(ctx, s, p)),
        h('td.tr', null, ...traitChips(p.traits)));
      toggleClass(tr, 'sad', p.mood === 'burnout');
      body.append(tr);
      bind((st) => {
        const cur = st.staff.find((x) => x.id === p.id);
        if (!cur) return;
        const v = showM ? cur.meaning : cur.stamina ?? 0;
        setWidth(mFill, v / 100);
        const c = showM ? moodColor(cur) : '#ffb020';
        if (mFill.style.background !== c) mFill.style.background = c;
        setText(mVal, Math.round(v));
        tired.style.display = (cur.stamina ?? 100) < TIRED_STAMINA ? '' : 'none';
        setWidth(kFill, cur.knowledge / 100);
        setText(kVal, Math.round(cur.knowledge));
      });
    }
    const cap = capacityOf(s);
    const sad = s.staff.filter((p) => p.mood === 'burnout' || p.mood === 'coasting').length;
    const juniors = s.staff.filter((p) => p.seniority === 'junior').length;
    const mentored = s.staff.filter((p) => p.seniority === 'junior' && mentorOf(s, p)).length;
    return [
      h('div.row.wrap.summaryline', null,
        h('span.pill', null, icon('team'), ` ${s.staff.length}/${cap} seats`),
        h('span', { class: sad ? 'pill warn' : 'pill good' }, icon(sad ? 'mood.coasting' : 'mood.ok'), sad ? ` ${sad} unhappy` : ' Everyone is okay'),
        h('span', { class: juniors && mentored < juniors ? 'pill warn' : 'pill' }, icon('mentor'), ` ${mentored}/${juniors} juniors mentored`),
        h('span.spacer'),
        h('button.btn.small.primary', { onclick: () => { tab = 'hire'; t.set('hire'); render(); } }, icon('hire'), ' Hire people')),
      h('table.stafftable', null, h('thead', null, head), body),
    ];
  }

  function renderDetail(s, bind) {
    const p = s.staff.find((x) => x.id === detailId);
    const back = h('button.btn.small', { onclick: () => { detailId = null; render(); } }, icon('arrow.back'), ' Back to team');
    if (!p) return [back, h('div.empty', { text: 'They are no longer with the company.' })];

    const xpFill = h('i', { style: { background: '#ffb020' } });
    const xpText = h('span.num.small');
    const need = (B.xpPerLevel ?? 60) * p.level;
    bind((st) => { const c = st.staff.find((x) => x.id === p.id); if (!c) return; setWidth(xpFill, c.xp / need); setText(xpText, `${Math.floor(c.xp)}/${need} xp`); });

    const statBar = (label, get, color, max = 100, fmt = (v) => Math.round(v), sub = null) => {
      const f = h('i', { style: { background: color } });
      const v = h('b.num');
      bind((st) => { const c = st.staff.find((x) => x.id === p.id); if (!c) return; setWidth(f, get(c) / max); setText(v, fmt(get(c))); });
      return h('div.dstat', null, h('span', null, label, sub ? h('span.dsub', { text: sub }) : null), h('div.bar', null, f), v);
    };

    const log = ctx.meaningLog?.get(p.id) ?? [];
    const spark = log.length >= 2 ? sparkline(log, { color: moodColor(p) }) : h('span.faint.small', { text: 'Collecting weekly data...' });

    // Actions
    const acts = h('div.grid.actions');
    const away = !isAvailable(p);
    const assign = (type, targetId = null) => ctx.act({ type: 'assign', staffId: p.id, assignment: { type, targetId } });
    if (p.seniority === 'junior') {
      const m = mentorOf(s, p);
      const mentors = s.staff.filter((x) => x.seniority !== 'junior' && isAvailable(x) && x.id !== p.id);
      const sel = h('select', { onchange: (e) => { const id = e.target.value; e.target.blur(); if (id) ctx.act({ type: 'assign', staffId: id, assignment: { type: 'mentor', targetId: p.id } }); } },
        h('option', { value: '', text: m ? `Mentor: ${m.name}` : 'Pick a mentor...' }),
        ...mentors.filter((x) => x !== m).map((x) => h('option', { value: x.id, text: `${x.name} (${roleName(x.role)}, ${x.seniority})` })));
      acts.append(h('div.act', null, h('b', null, icon('mentor'), ' Mentor'), h('span.small.muted', { text: m ? 'Learning fast, and less bothered by automation.' : 'Without a mentor, juniors grow slowly while automation eats their practice work.' }), sel));
    } else {
      const juniors = s.staff.filter((x) => x.seniority === 'junior');
      const sel = h('select', { disabled: away, onchange: (e) => { const id = e.target.value; e.target.blur(); if (id) assign('mentor', id); } },
        h('option', { value: '', text: p.assignment.type === 'mentor' ? `Mentoring ${s.staff.find((x) => x.id === p.assignment.targetId)?.name ?? ''}` : juniors.length ? 'Mentor a junior...' : 'No juniors to mentor' }),
        ...juniors.map((x) => h('option', { value: x.id, text: x.name })));
      acts.append(h('div.act', null, h('b', null, icon('mentor'), ' Mentor a junior'), h('span.small.muted', { text: 'Grows the next generation. Restores meaning.' }), sel));
    }
    if (p.seniority === 'senior') {
      acts.append(h('div.act', null, h('b', null, icon('hardProblem'), ' Hard problem'), h('span.small.muted', { text: 'Something gnarly only a human can crack. Ideas and meaning.' }),
        h('button.btn.small', { disabled: away || p.assignment.type === 'hardProblem', onclick: () => assign('hardProblem') }, p.assignment.type === 'hardProblem' ? 'On it' : 'Assign')));
    }
    acts.append(h('div.act', null, h('b', null, icon('oversight'), ' Oversight'), h('span.small.muted', { text: 'Watches the agents. Catching incidents feels great.' }),
      h('button.btn.small', { disabled: away || p.assignment.type === 'oversight', onclick: () => assign('oversight') }, p.assignment.type === 'oversight' ? 'On duty' : 'Assign')));
    acts.append(h('div.act', null, h('b', null, icon('sabbatical'), ' Sabbatical'), h('span.small.muted', { text: s.policies?.sabbatical ? `${B.sabbaticalWeeks ?? 4} weeks off. Comes back refreshed.` : 'Needs the Sabbatical Program policy.' }),
      h('button.btn.small', { disabled: away, onclick: () => assign('sabbatical') }, away ? 'Away' : 'Send')));
    acts.append(h('div.act', null, h('b', null, icon('training'), ' Training'), h('span.small.muted', { text: 'Workshop, conference, or course. XP, skills, meaning, know-how.' }),
      h('button.btn.small.blue', { disabled: away, onclick: () => openTraining(ctx, p.id) }, 'Pick a program')));
    const fire = p.founder
      ? h('button.btn.small.danger', { disabled: true, title: 'Founders cannot be fired' }, 'Founder')
      : confirmButton('Let go', 'Really? Click again', 'small.danger', () => { if (ctx.act({ type: 'fire', staffId: p.id }).ok) { detailId = null; render(); } });
    acts.append(h('div.act', null, h('b', null, icon('letgo'), ' Let go'), h('span.small.muted', { text: 'Their knowledge walks out the door with them.' }), fire));

    const mood = MOOD_INFO[p.mood] ?? MOOD_INFO.ok;
    const showM = meaningShown(s);
    // Running on empty for a while: say so, with the two levers that help right now.
    const empty = emptyWeeks(p);
    const onProject = p.assignment.type === 'project';
    const emptyCard = empty >= EMPTY_WARN_WEEKS ? h('div.card.emptywarn', null,
      icon('battery.low', { size: 22 }),
      h('div', { style: { flex: 1, minWidth: 0 } }, h('b', { text: `Running on empty for ${empty} weeks` }),
        h('div.small', { text: 'Stamina has been near zero. Keep this up and burnout comes next, then a resignation letter.' })),
      h('div.row.wrap', null,
        h('button.btn.small', { disabled: !onProject && p.assignment.type === 'idle', onclick: () => { if (assign('idle').ok) ctx.sfx('click'); } }, 'Lighter load'),
        h('button.btn.small.go', { disabled: away, title: s.policies?.sabbatical ? '' : 'Needs the Sabbatical Program policy', onclick: () => { if (assign('sabbatical').ok) ctx.sfx('confirm'); } }, 'Time off'))) : null;
    return [
      h('div.row', null, back, h('span.spacer'), h('span.faint.small', { text: 'Tip: click people in the office to open this.' })),
      emptyCard,
      h('div.detail', null,
        h('div.dleft', null,
          h('div.bigportrait', null, portraitLive(p, 112)),
          h('h2.dname', { text: p.name }),
          h('div.row.wrap', null, roleChip(p.role), seniorityChip(p.seniority), p.founder ? h('span.pill.ink', { text: 'Founder' }) : null),
          h('div.row', null, h('b.num', { text: `Lv ${p.level}` }), h('div.bar', { style: { flex: 1 } }, xpFill), xpText),
          h('div.small.muted', { text: `Salary ${fmtMoney(p.salary)}/wk · hired week ${p.hiredWeek}` }),
          h('div.moodbadge', { style: { background: mood.color } }, icon(`mood.${p.mood}`), ` ${mood.name}`),
          p.pathPending ? h('button.btn.primary', { onclick: () => openPathPicker(ctx, p.id) }, icon('path'), ' Choose a career path')
            : p.path ? h('div.pathinfo', null, h('b', null, p.legend ? icon('legend') : icon('path'), ` ${p.legend ? 'Legend ' : ''}${PATHS[p.path]?.name ?? p.path}`),
              h('div.small.muted', { text: PATHS[p.path]?.desc ?? '' })) : null,
          h('div.small', null, h('b', { text: 'Doing: ' }), assignmentText(s, p)),
          assignSelect(ctx, s, p)),
        h('div.dmid', null,
          h('div.section', null, h('h3', null, 'Skills', h('span.aside', null, strengthChip(p))),
            ...STATS.map((st) => statBar(h('span.skname', null, icon(st.icon, { size: 14 }), ` ${st.skill}`), (c) => c.skills[st.id], st.color, 100, (v) => Math.round(v), `drives ${st.product}`))),
          h('div.section', null, h('h3', null, 'Condition'),
            showM ? statBar('Meaning', (c) => c.meaning, moodColor(p)) : null,
            statBar('Stamina', (c) => c.stamina, '#ffb020'),
            statBar('Know-how', (c) => c.knowledge, '#3fb6b0'),
            statBar('Speed', (c) => c.speed, '#9b6bff', 1.2, (v) => `${v.toFixed(2)}x`)),
          showM ? h('div.section', null, h('h3', null, 'Meaning lately'), spark) : null),
        h('div.dright', null,
          h('div.section', null, h('h3', null, 'Traits'),
            p.traits.length ? h('div.grid', null, ...p.traits.map((id) => { const ti = traitInfo(id); return h('div.traitrow', null, h('span.pill.trait', { text: ti.name }), h('span.small.muted', { text: ti.desc })); }))
              : h('span.faint.small', { text: 'No notable traits.' })),
          h('div.section', null, h('h3', null, 'Actions'), acts))),
    ];
  }

  render();
  if (arg?.pickPath && arg.staffId) setTimeout(() => openPathPicker(ctx, arg.staffId), 0);
  return {
    el: host,
    tabs: t.el,
    update(s) {
      t.setLabel('team', `Team (${s.staff.length})`);
      t.setLabel('hire', `Hire (${s.candidates.length})`);
      (tab === 'hire' ? hire : detailId ? detail : table).update(s);
    },
    show(a) {
      if (a?.staffId) { tab = 'team'; detailId = a.staffId; t.set('team'); render(); }
    },
  };
}


// Dense lists show only the person's best skill: icon and name, no number.
function bestChip(p) {
  const b = STATS.reduce((best, x) => ((p.skills?.[x.id] ?? 0) > (p.skills?.[best.id] ?? 0) ? x : best), STATS[0]);
  return h('span.bestskill', { title: `Best skill: ${b.skill} ${p.skills?.[b.id] ?? 0} (drives ${b.product})` }, icon(b.icon, { size: 14 }), ` ${b.skill}`);
}
