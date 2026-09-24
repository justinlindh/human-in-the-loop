import { h, setText, setWidth, fmtNum, toggleClass } from '../dom.js';
import { RESEARCH } from '../../data/research.js';
import { liveView } from '../widgets.js';
import { icon } from '../icons.js';
import { beforeEra } from '../v2content.js';

// Roots first, each followed by the tools that require it (one level of prerequisites).
function treeOrder() {
  const all = Object.values(RESEARCH);
  const out = [];
  const visit = (r, depth) => { out.push({ r, depth }); for (const c of all.filter((x) => x.requires === r.id)) visit(c, depth + 1); };
  for (const r of all.filter((x) => !x.requires || !RESEARCH[x.requires])) visit(r, 0);
  return out;
}

export function researchView(ctx, { onStarted }) {
  return liveView(
    (s) => `${s.era?.id}|${(s.research?.done ?? []).join()}|${s.projects.filter((j) => j.kind === 'research').map((j) => j.researchId).join()}`,
    (s, bind) => {
      const done = new Set(s.research?.done ?? []);
      // AI research stays out of sight until the Agents era.
      const cards = treeOrder().filter(({ r }) => !(r.ai && beforeEra(s, 'agents'))).map(({ r, depth }) => {
        const proj = s.projects.find((j) => j.kind === 'research' && j.researchId === r.id);
        const state = done.has(r.id) ? 'done' : proj ? 'running' : r.requires && !done.has(r.requires) ? 'locked' : 'open';
        let action;
        if (state === 'done') action = h('span.pill.good', null, icon('check', { size: 12 }), ' Built');
        else if (state === 'locked') action = h('span.pill.warn', null, icon('lock', { size: 12 }), ` Requires ${RESEARCH[r.requires]?.name ?? r.requires}`);
        else if (state === 'running') {
          const fill = h('i');
          const pct = h('span.num.small');
          bind((st) => {
            const j = st.projects.find((x) => x.id === proj.id);
            if (!j) return;
            const f = j.pointsNeeded > 0 ? j.progress / j.pointsNeeded : 0;
            setWidth(fill, f);
            setText(pct, `${Math.floor(Math.min(1, f) * 100)}%`);
          });
          action = h('div.rrun', null, h('div.bar', null, fill), pct,
            h('button.btn.small', { onclick: () => onStarted(proj.id) }, 'Team'));
        } else {
          action = h('button.btn.small.blue', {
            onclick: () => {
              const res = ctx.act({ type: 'startProject', kind: 'research', researchId: r.id });
              if (res.ok) { ctx.sfx('confirm'); onStarted(res.projectId); }
            },
          }, `Start · ${fmtNum(r.points)} pts`);
        }
        const card = h(`div.card.rcard.${state}`, { style: { marginLeft: `${depth * 2.2}em` } },
          depth ? h('span.rlink') : null,
          h('span.rico', null, icon(`research.${r.id}`, { size: 26 })),
          h('div.rbody', null, h('b', { text: r.name }), h('div.small.muted', { text: r.desc })),
          action);
        toggleClass(card, 'child', depth > 0);
        return card;
      });
      return [
        h('div.small.muted', { style: { marginBottom: '0.7em' }, text: 'Internal tools are engineering projects with permanent effects. Put engineers on them from the Projects tab.' }),
        h('div.rtree', null, ...cards),
      ];
    });
}
