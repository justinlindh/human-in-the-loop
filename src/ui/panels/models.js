import { h, fmtMoney, toggleClass } from '../dom.js';
import { MODELS, FUNCTIONS, FUNCTION_INFO, CATEGORY } from '../content.js';
import { liveView } from '../widgets.js';
import { icon } from '../icons.js';

function statRow(label, frac, color, text) {
  return h('div.mstat.big', null, h('span', { text: label }),
    h('div.bar', null, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`, background: color } })),
    h('b.num', { text }));
}

export function modelsPanel(ctx) {
  const view = liveView(
    (s) => JSON.stringify([s.models, s.products.map((p) => [p.id, p.model, p.modelVersion, p.migrationDueWeek, p.killed]),
      Object.values(s.automation).map((a) => [a.model, a.level]), s.projects.map((j) => j.kind + j.productId), Math.floor(s.week)]),
    (s) => {
      const live = s.products.filter((p) => !p.killed);
      const migrating = new Set(s.projects.filter((j) => j.kind === 'migration').map((j) => j.productId));
      const due = live.filter((p) => p.migrationDueWeek !== null && p.migrationDueWeek !== undefined);

      const warns = due.length ? h('div.card.migwarn', null,
        h('b', null, icon('migrate'), ' Migrations due'),
        h('span.small', { text: 'The vendor is retiring the model version these run on. Miss the deadline and product health drops every week.' }),
        ...due.map((p) => {
          const late = p.migrationDueWeek <= s.week;
          return h('div.row', null,
            h('b', { text: p.name }),
            h('span', { class: late ? 'bad-t small' : 'warn-t small', text: late ? `overdue by ${s.week - p.migrationDueWeek}w` : `due in ${p.migrationDueWeek - s.week}w` }),
            h('span.spacer'),
            migrating.has(p.id) ? h('span.pill.good', { text: 'Migrating...' })
              : h('button.btn.small.blue', { onclick: () => { if (ctx.act({ type: 'startProject', kind: 'migration', productId: p.id }).ok) ctx.sfx('confirm'); } }, 'Migrate'));
        })) : null;

      const grid = h('div.vendors');
      for (const m of MODELS) {
        const ms = s.models[m.id] ?? {};
        const prods = live.filter((p) => p.model === m.id);
        const fns = FUNCTIONS.filter((f) => s.automation[f]?.model === m.id && s.automation[f]?.level > 0);
        const cost = m.productCost * (ms.costMult ?? 1);
        const status = !ms.available ? `Arrives ${m.releaseYear}` : null;
        const card = h('div.vendor', { style: { '--mc': m.color } },
          h('div.vhead', null,
            h('span.vname', { text: m.name }),
            h('span.vver.num', { text: `v${ms.version ?? 1}` }),
            (ms.costMult ?? 1) > 1.001 ? h('span.pill.bad', { text: `price x${(ms.costMult).toFixed(2)}` }) : null),
          h('div.vbody', null,
            h('div.small.muted.vblurb', { text: m.blurb }),
            statRow('Brains', (ms.capability ?? m.capability) / 100, '#4f8cff', Math.round(ms.capability ?? m.capability)),
            statRow('Guardrails', m.guardrails, '#34c38f', `${Math.round(m.guardrails * 100)}%`),
            statRow('Brand trust', m.trust, '#9b6bff', `${Math.round(m.trust * 100)}%`),
            h('div.row.wrap.vcost', null,
              h('span.pill', { title: 'Model cost per customer per month', }, icon('money'), ` $${cost.toFixed(2)}/customer`),
              h('span.pill', { title: 'Weekly cost of one automation function at 100%', }, icon('agentic'), ` ${fmtMoney(m.autoCost * (ms.costMult ?? 1))}/wk`)),
            h('div.row.wrap', null,
              h('span', { class: m.complianceOk ? 'pill good' : 'pill bad' }, icon(m.complianceOk ? 'check' : 'cross'), m.complianceOk ? ' Enterprise compliant' : ' Fails compliance'),
              m.selfHosted ? h('span.pill.warn', { title: 'You run the GPUs: a flat weekly bill once anything uses it', }, icon('selfhost'), ' Self-hosted') : null),
            h('div.vuses', null,
              h('span.small.faint', { text: 'Used by' }),
              prods.length || fns.length
                ? h('div.row.wrap', null,
                  ...prods.map((p) => {
                    const warn = CATEGORY[p.category]?.compliance && !m.complianceOk;
                    const behind = (p.modelVersion ?? ms.version) < (ms.version ?? 1);
                    return h('span', { class: `pill ${warn || p.migrationDueWeek != null ? 'warn' : 'ink'}`, title: warn ? 'Compliance-heavy category on a non-compliant model' : behind ? `Runs v${p.modelVersion}` : '', }, icon('product'), ` ${p.name}${behind ? ` (v${p.modelVersion})` : ''}`);
                  }),
                  ...fns.map((f) => h('span.pill', null, icon(`fn.${f}`, { size: 12 }), ` ${FUNCTION_INFO[f].name} ${Math.round(s.automation[f].level * 100)}%`)))
                : h('span.small.faint', { text: 'Nothing yet' }))),
          status ? h('div.vstatus', null, icon('lock', { size: 14 }), ` ${status}`) : null);
        toggleClass(card, 'off', !!status);
        grid.append(card);
      }
      return [warns, grid];
    });
  return { el: view.el, update: (s, f) => view.update(s, f) };
}
