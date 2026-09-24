import { h, setText, setWidth, fmtMoney, fmtNum, dateOf, toggleClass } from '../dom.js';
import { CATEGORIES, ANGLES, MODELS, B, MODEL, CATEGORY, ROLES } from '../content.js';
import { portrait, liveView, stars, tabs } from '../widgets.js';
import { projectLabel, KIND_LABEL, isAvailable, assignmentText, suggestName } from './common.js';

export const STAT_INFO = [
  { id: 'features', name: 'Features', short: 'F', color: '#4f8cff' },
  { id: 'polish', name: 'Polish', short: 'P', color: '#ff7eb6' },
  { id: 'reliability', name: 'Reliability', short: 'R', color: '#34c38f' },
  { id: 'novelty', name: 'Novelty', short: 'N', color: '#ffb020' },
];

const SIZE_INFO = { small: { name: 'Small', icon: '🧁' }, medium: { name: 'Medium', icon: '🎂' }, large: { name: 'Large', icon: '🏰' } };

export function buildPanel(ctx) {
  let tab = 'new';
  const form = { name: suggestName(), category: null, angle: null, model: 'chatgbt', size: 'small', team: null };

  const t = tabs([{ id: 'new', label: '✨ New Product' }, { id: 'projects', label: '🔨 Projects' }], tab, (id) => { tab = id; t.set(id); render(); });
  const host = h('div');

  const newView = liveView(
    (s) => [form.category, form.angle, form.model, form.size, s.market.unlockedCategories.join(), s.market.unlockedAngles.join(),
      Object.values(s.models).map((m) => `${m.available}${m.deprecated}${m.capability}`).join(), s.officeStage,
      s.staff.map((p) => `${p.id}${p.mood}${p.assignment.type}`).join()].join('|'),
    (s, bind) => renderNew(s, bind));

  const projView = liveView(
    (s) => [s.projects.map((j) => j.id).join(), s.staff.map((p) => `${p.id}${p.assignment.type}${p.assignment.targetId}${p.mood}`).join(),
      s.products.map((p) => `${p.id}${p.killed}${p.migrationDueWeek}`).join()].join('|'),
    (s, bind) => renderProjects(s, bind));

  function render() {
    host.replaceChildren(tab === 'new' ? newView.el : projView.el);
    (tab === 'new' ? newView : projView).update(ctx.getState(), true);
  }

  function refreshNew() { newView.update(ctx.getState(), true); }

  function renderNew(s, bind) {
    const year = dateOf(s.week).year;
    if (!form.team) {
      form.team = new Set(s.staff.filter((p) => isAvailable(p) && (p.role === 'engineer' || p.role === 'designer')
        && (p.assignment.type === 'idle' || (p.founder && p.assignment.type !== 'project'))).map((p) => p.id));
    }
    for (const id of [...form.team]) if (!s.staff.some((p) => p.id === id && isAvailable(p))) form.team.delete(id);
    if (!s.models[form.model]?.available || s.models[form.model]?.deprecated) form.model = MODELS.find((m) => s.models[m.id]?.available && !s.models[m.id]?.deprecated)?.id ?? form.model;

    // Name
    const nameInput = h('input.text', { value: form.name, maxlength: 28, placeholder: 'Product name', oninput: (e) => { form.name = e.target.value; } });
    const nameRow = h('div.row', null, nameInput,
      h('button.btn.small', { onclick: () => { form.name = suggestName(form.category); nameInput.value = form.name; }, title: 'Suggest a name' }, '🎲 Suggest'));

    // Category grid
    const catGrid = h('div.tiles.cats');
    for (const c of CATEGORIES) {
      const unlocked = s.market.unlockedCategories.includes(c.id);
      const tile = h('button.tile', {
        disabled: !unlocked,
        title: unlocked ? `${c.name}: $${c.price}/customer/month, ${fmtNum(c.tam)} potential customers${c.compliance ? '. Compliance-heavy.' : ''}` : `Unlocks in ${c.unlockYear}`,
        onclick: () => { form.category = c.id; refreshNew(); },
      },
      h('span.ti', { text: unlocked ? c.icon : '🔒' }),
      h('span.tn', { text: c.name }),
      h('span.ts.num', { text: unlocked ? `$${c.price}/mo` : `${c.unlockYear}` }),
      c.compliance && unlocked ? h('span.tag', { text: '📜', title: 'Compliance-heavy' }) : null);
      toggleClass(tile, 'on', form.category === c.id);
      toggleClass(tile, 'locked', !unlocked);
      catGrid.append(tile);
    }

    // Angle grid, with stars for combos you have already discovered in this category
    const angGrid = h('div.tiles.angles');
    for (const a of ANGLES) {
      const unlocked = s.market.unlockedAngles.includes(a.id);
      const fit = form.category ? s.discoveredCombos?.[`${form.category}:${a.id}`] : undefined;
      const tile = h('button.tile.wide', {
        disabled: !unlocked,
        title: unlocked ? a.blurb : `Unlocks in ${a.unlockYear}`,
        onclick: () => { form.angle = a.id; refreshNew(); },
      },
      h('span.tn', { text: unlocked ? a.name : `🔒 ${a.name}` }),
      h('span.tb', { text: unlocked ? a.blurb : `Unlocks in ${a.unlockYear}` }),
      h('span.tf', null, fit !== undefined ? stars(fit) : h('span.faint', { text: form.category && unlocked ? '? fit' : '' }),
        a.agentic && unlocked ? h('span.tag', { title: 'Agentic: needs human oversight', text: '🤖' }) : null));
      toggleClass(tile, 'on', form.angle === a.id);
      toggleClass(tile, 'locked', !unlocked);
      angGrid.append(tile);
    }

    // Model cards
    const cat = CATEGORY[form.category];
    const modelGrid = h('div.tiles.models');
    for (const m of MODELS) {
      const ms = s.models[m.id] ?? {};
      const ok = ms.available && !ms.deprecated;
      const warn = cat?.compliance && !m.complianceOk;
      const bar = (label, v, color) => h('div.mstat', null, h('span', { text: label }), h('div.bar', null, h('i', { style: { width: `${Math.round(v * 100)}%`, background: color } })));
      const card = h('button.tile.model', {
        disabled: !ok,
        style: { '--mc': m.color },
        title: m.blurb,
        onclick: () => { form.model = m.id; refreshNew(); },
      },
      h('span.mhead', null, h('span.tn', { text: m.name }), h('span.ts.num', { text: `v${ms.version ?? 1}` })),
      bar('Brains', (ms.capability ?? m.capability) / 100, '#4f8cff'),
      bar('Guardrails', m.guardrails, '#34c38f'),
      bar('Trust', m.trust, '#9b6bff'),
      h('span.mfoot', null,
        h('span.num', { text: `$${(m.productCost * (ms.costMult ?? 1)).toFixed(2)}/cust`, title: 'Model cost per customer per month' }),
        h('span', { class: m.complianceOk ? 'pill good' : 'pill bad', text: m.complianceOk ? '✔ Compliant' : '✖ Compliance', title: m.complianceOk ? 'Passes enterprise compliance' : 'Enterprise buyers in compliance-heavy categories will balk' })),
      !ok ? h('span.lockover', { text: ms.deprecated ? 'Deprecated' : `🔒 ${m.releaseYear ?? ''}` }) : null,
      warn ? h('span.warnover', { text: '⚠️ Compliance penalty here' }) : null);
      toggleClass(card, 'on', form.model === m.id);
      modelGrid.append(card);
    }

    // Size
    const sizeRow = h('div.row.sizes');
    for (const [id, sz] of Object.entries(B.sizes)) {
      const locked = s.officeStage < (sz.minStage ?? 0);
      const pts = Math.round(sz.points * (1 + (B.pointsGrowthPerYear ?? 0.1) * dateOf(s.week).yearIndex));
      const btn = h('button.tile.size', {
        disabled: locked,
        title: locked ? 'Needs a bigger office' : `${pts} work points to finish`,
        onclick: () => { form.size = id; refreshNew(); },
      }, h('span.ti', { text: locked ? '🔒' : SIZE_INFO[id].icon }), h('span.tn', { text: SIZE_INFO[id].name }),
      h('span.ts.num', { text: locked ? 'Office Floor' : `${fmtMoney(sz.cost)} · ${pts} pts` }));
      toggleClass(btn, 'on', form.size === id);
      sizeRow.append(btn);
    }

    // Team picker
    const team = h('div.picker');
    const avail = s.staff.filter(isAvailable);
    const countEl = h('span.aside');
    for (const p of avail) {
      const onProj = p.assignment.type === 'project';
      const row = h('button.pick', {
        onclick: () => { if (form.team.has(p.id)) form.team.delete(p.id); else form.team.add(p.id); toggleClass(row, 'on', form.team.has(p.id)); setText(countEl, `${form.team.size} picked`); newView.update(ctx.getState()); },
        title: onProj ? `Currently on ${assignmentText(s, p)}. Picking moves them.` : assignmentText(s, p),
      },
      h('span.check', { text: '✔' }),
      portrait(p, 30),
      h('span.pn', null, h('b', { text: p.name }), h('span.faint', { text: ` Lv${p.level}` })),
      h('span.pr', { style: { background: ROLES[p.role]?.color } }),
      h('span.pm', { text: p.mood === 'burnout' ? '😵' : p.mood === 'coasting' ? '😐' : '😊' }),
      onProj ? h('span.busy', { text: 'busy' }) : null);
      toggleClass(row, 'on', form.team.has(p.id));
      team.append(row);
    }
    setText(countEl, `${form.team.size} picked`);

    // Summary and start
    const size = B.sizes[form.size];
    const missing = !form.category ? 'Pick a category' : !form.angle ? 'Pick an AI angle' : !form.name.trim() ? 'Name it' : null;
    const cashAfter = h('span.num');
    const startBtn = h('button.btn.go.big', { onclick: () => start() }, '🚀 Start building');
    const note = h('div.faint.small');
    bind((st) => {
      setText(cashAfter, fmtMoney(st.cash - size.cost));
      cashAfter.className = `num ${st.cash - size.cost < 0 ? 'bad-t' : ''}`;
      const reason = missing ?? (st.cash < size.cost ? 'Not enough cash' : form.team.size === 0 ? 'Pick at least one person' : null);
      startBtn.disabled = !!reason;
      setText(note, reason ?? `${CATEGORY[form.category]?.name} × ${ANGLES.find((a) => a.id === form.angle)?.name} on ${MODEL[form.model]?.name}`);
    });
    const fit = form.category && form.angle ? s.discoveredCombos?.[`${form.category}:${form.angle}`] : undefined;
    const summary = h('div.card.summary', null,
      h('div.sumrow', null, h('span', { text: 'Cost' }), h('b.num', { text: fmtMoney(size.cost) })),
      h('div.sumrow', null, h('span', { text: 'Cash after' }), cashAfter),
      h('div.sumrow', null, h('span', { text: 'Combo' }), fit !== undefined ? stars(fit) : h('span.faint', { text: form.category && form.angle ? 'Unknown. Ship to find out!' : '...' })),
      startBtn, note);

    return h('div.buildgrid', null,
      h('div.buildmain', null,
        h('div.section', null, h('h3', null, '1. Name'), nameRow),
        h('div.section', null, h('h3', null, '2. Category', h('span.aside', { text: 'price per customer per month' })), catGrid),
        h('div.section', null, h('h3', null, '3. AI angle', h('span.aside', { text: '★ = combos you have launched' })), angGrid),
        h('div.section', null, h('h3', null, '4. Model vendor'), modelGrid),
        h('div.section', null, h('h3', null, '5. Size'), sizeRow)),
      h('div.buildside', null,
        h('div.section', null, h('h3', null, '6. Team', countEl), avail.length ? team : h('div.empty', { text: 'Everyone is away.' })),
        summary));
  }

  function start() {
    const before = new Set(ctx.getState().projects.map((j) => j.id));
    const res = ctx.act({ type: 'startProject', kind: 'new', name: form.name.trim(), category: form.category, angle: form.angle, model: form.model, size: form.size });
    if (!res.ok) return;
    const s = ctx.getState();
    const proj = s.projects.find((j) => !before.has(j.id));
    let placed = 0;
    if (proj) for (const id of form.team) if (ctx.act({ type: 'assign', staffId: id, assignment: { type: 'project', targetId: proj.id } }).ok) placed++;
    ctx.toast(`Started ${form.name.trim()} with ${placed} ${placed === 1 ? 'person' : 'people'}`, 'good');
    ctx.sfx('confirm');
    form.name = suggestName();
    form.team = null;
    form.angle = null;
    tab = 'projects';
    t.set(tab);
    render();
  }

  function renderProjects(s, bind) {
    const out = [];
    if (!s.projects.length) out.push(h('div.empty', { text: 'Nothing in the works. Start a new product, or pick something below.' }));
    for (const j of s.projects) {
      const pct = h('span.num');
      const fill = h('i');
      const statEls = STAT_INFO.map((st) => {
        const v = h('b.num');
        const f = h('i', { style: { background: st.color } });
        return { st, v, f, el: h('div.pstat', { title: st.name }, h('span', { text: st.short }), h('div.bar', null, f), v) };
      });
      const people = s.staff.filter((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id);
      const addSel = h('select.addsel', {
        onchange: (e) => {
          const id = e.target.value;
          e.target.value = '';
          if (id) ctx.act({ type: 'assign', staffId: id, assignment: { type: 'project', targetId: j.id } });
          e.target.blur();
        },
      }, h('option', { value: '', text: '+ Add person' }),
      ...s.staff.filter((p) => isAvailable(p) && !(p.assignment.type === 'project' && p.assignment.targetId === j.id))
        .map((p) => h('option', { value: p.id, text: `${p.name} (${ROLES[p.role]?.name ?? p.role} Lv${p.level})` })));
      const crew = h('div.crew', null, ...people.map((p) => h('span.crewmate', { title: `${p.name}: click to take off this project` },
        portrait(p, 26), h('span', { text: p.name.split(' ')[0] }),
        h('button.x', { text: '✕', onclick: () => ctx.act({ type: 'assign', staffId: p.id, assignment: { type: ROLES[p.role]?.defaultAssignment ?? 'idle', targetId: null } }) }))),
      people.length ? null : h('span.bad-t.small', { text: 'Nobody is working on this!' }), addSel);
      const meta = j.kind === 'new' ? `${CATEGORY[j.category]?.name ?? j.category} × ${ANGLES.find((a) => a.id === j.angle)?.name ?? j.angle} · ${MODEL[j.model]?.name ?? j.model}` : KIND_LABEL[j.kind];
      out.push(h('div.card.proj', null,
        h('div.row', null, h('span.pill.ink', { text: KIND_LABEL[j.kind] ?? j.kind }), h('b.ptitle', { text: projectLabel(s, j) }), h('span.faint.small', { text: meta }), h('span.spacer'), pct),
        h('div.bar.thick', null, fill),
        j.kind === 'new' || j.kind === 'update' ? h('div.pstats', null, ...statEls.map((x) => x.el)) : null,
        crew));
      bind((st) => {
        const cur = st.projects.find((x) => x.id === j.id);
        if (!cur) return;
        const f = cur.pointsNeeded > 0 ? cur.progress / cur.pointsNeeded : 0;
        setWidth(fill, f);
        setText(pct, `${Math.floor(Math.min(1, f) * 100)}%  ${fmtNum(cur.progress)}/${fmtNum(cur.pointsNeeded)}`);
        const mx = Math.max(1, ...STAT_INFO.map((x) => cur.stats?.[x.id] ?? 0));
        for (const x of statEls) { const v = cur.stats?.[x.st.id] ?? 0; setWidth(x.f, v / mx); setText(x.v, Math.round(v)); }
      });
    }

    // Other kinds of work
    const live = s.products.filter((p) => !p.killed);
    const updSel = h('select', null, ...live.map((p) => h('option', { value: p.id, text: `${p.name} v${p.version} (score ${p.score.toFixed(1)})` })));
    const migr = live.filter((p) => p.migrationDueWeek !== null && p.migrationDueWeek !== undefined);
    const other = h('div.grid.others', null,
      h('div.card.other', null,
        h('b', { text: '⬆️ Update a product' }),
        h('span.small.muted', { text: 'Refreshes novelty and gets fresh reviews.' }),
        live.length ? h('div.row', null, updSel, h('button.btn.small.blue', { onclick: () => startKind({ kind: 'update', productId: updSel.value }) }, 'Start')) : h('span.faint.small', { text: 'No live products yet.' })),
      h('div.card.other', null,
        h('b', { text: '🔁 Model migration' }),
        h('span.small.muted', { text: 'Vendors deprecate old versions. Skipping a migration hurts health.' }),
        migr.length ? h('div.col', null, ...migr.map((p) => h('div.row', null,
          h('span.small', { text: `${p.name}: due ${p.migrationDueWeek <= s.week ? 'NOW' : `in ${p.migrationDueWeek - s.week}w`}`, class: p.migrationDueWeek <= s.week ? 'bad-t small' : 'warn-t small' }),
          h('button.btn.small.blue', { onclick: () => startKind({ kind: 'migration', productId: p.id }) }, 'Migrate'))))
          : h('span.faint.small', { text: 'Nothing due.' })),
      h('div.card.other', null,
        h('b', { text: '🧹 Refactor' }),
        h('span.small.muted', { text: `Humans read and clean the code. Pays down comprehension debt (now ${Math.round(s.comprehensionDebt)}).` }),
        h('button.btn.small.blue', { onclick: () => startKind({ kind: 'refactor' }) }, 'Start refactor')),
      h('div.card.other', null,
        h('b', { text: '🪵 Craft project' }),
        h('span.small.muted', { text: 'A lovingly hand-made side project. Big meaning boost for whoever builds it.' }),
        h('button.btn.small.blue', { onclick: () => startKind({ kind: 'craft' }) }, 'Start craft project')));
    out.push(h('div.section', { style: { marginTop: '1em' } }, h('h3', null, 'Start other work'), other));
    return out;
  }

  function startKind(action) {
    const res = ctx.act({ type: 'startProject', ...action });
    if (res.ok) { ctx.toast(`${KIND_LABEL[action.kind]} started. Assign some people!`, 'good'); ctx.sfx('confirm'); }
  }

  render();
  return {
    el: host,
    tabs: t.el,
    update(s) {
      t.setLabel('projects', `🔨 Projects (${s.projects.length})`);
      (tab === 'new' ? newView : projView).update(s);
    },
  };
}

