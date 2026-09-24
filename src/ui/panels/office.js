import { h, setText, fmtMoney, toggleClass } from '../dom.js';
import { OFFICE_STAGES } from '../content.js';
import { ITEMS } from '../../data/items.js';
import { liveView, confirmButton } from '../widgets.js';
import { icon } from '../icons.js';

const EFFECT_LABEL = {
  staminaRecovery: 'stamina recovery', meaningRecovery: 'meaning recovery', burnoutResign: 'burnout resignations',
  output: 'output', staminaDrain: 'stamina drain', novelty: 'novelty', knowledgeGain: 'knowledge gain',
  oversight: 'oversight per person', maintenanceNeed: 'maintenance need', uptimeFloor: 'minimum uptime', brandDecay: 'brand decay',
};

// Plain words for an effects map, for example "+15% stamina recovery, -2% output".
export function effectWords(effects) {
  return Object.entries(effects ?? {}).map(([k, v]) => {
    const label = EFFECT_LABEL[k] ?? k.replace(/([A-Z])/g, ' $1').toLowerCase();
    const n = Math.round(v * 100);
    return `${n > 0 ? '+' : ''}${n}${k === 'uptimeFloor' ? ' pts' : '%'} ${label}`;
  }).join(', ');
}

const refund = (it, level) => it.costs.slice(0, level).reduce((a, b) => a + b, 0) / 2;

function pips(level) {
  return h('span.lvpips', { title: `Level ${level} of 3` }, ...[1, 2, 3].map((i) => h(`i${i <= level ? '.on' : ''}`)));
}

export function officePanel(ctx) {
  const view = liveView(
    (s) => `${s.officeStage}|${s.staff.length}|${s.items.map((i) => `${i.id}${i.level}`).join()}|${s.stats?.awards ?? 0}`,
    (s, bind) => {
      const stage = OFFICE_STAGES[s.officeStage];
      const next = OFFICE_STAGES[s.officeStage + 1];
      const slots = stage.itemSlots ?? 0;
      const used = s.items.length;

      // Office stage card
      let upgrade;
      if (next) {
        const btn = h('button.btn.go', { onclick: () => { if (ctx.act({ type: 'upgradeOffice' }).ok) ctx.sfx('confirm'); } },
          icon('office'), ` Move to ${next.name} · ${fmtMoney(next.upgradeCost)}`);
        const why = h('span.why.small');
        bind((st) => { const r = st.cash < next.upgradeCost ? 'Not enough cash' : ''; btn.disabled = !!r; setText(why, r); });
        upgrade = h('div.card.stagecard', null,
          h('div', null, h('div.small.muted', { text: 'Your office' }), h('h2.oname', { text: stage.name })),
          h('div.row.wrap', null,
            h('span', { class: s.staff.length >= stage.capacity ? 'pill bad' : 'pill' }, icon('seat', { size: 12 }), ` ${s.staff.length}/${stage.capacity} seats`),
            h('span.pill', null, icon('rent', { size: 12 }), ` ${fmtMoney(stage.rent)}/wk rent`),
            h('span', { class: used >= slots ? 'pill warn' : 'pill' }, icon('slot', { size: 12 }), ` ${used}/${slots} item slots`)),
          h('span.spacer'),
          h('div.col.right', null,
            h('div.small.muted', { text: `${next.name}: ${next.capacity} seats, ${next.itemSlots ?? '?'} slots, ${fmtMoney(next.rent)}/wk rent` }),
            btn, why));
      } else {
        upgrade = h('div.card.stagecard', null,
          h('div', null, h('div.small.muted', { text: 'Your office' }), h('h2.oname', { text: stage.name })),
          h('div.row.wrap', null,
            h('span.pill', null, icon('seat', { size: 12 }), ` ${s.staff.length}/${stage.capacity} seats`),
            h('span', { class: used >= slots ? 'pill warn' : 'pill' }, icon('slot', { size: 12 }), ` ${used}/${slots} item slots`)),
          h('span.spacer'), h('span.small.muted', { text: 'The biggest office in town.' }));
      }

      // Shop
      const grid = h('div.shop');
      for (const it of Object.values(ITEMS)) {
        const owned = s.items.filter((i) => i.itemId === it.id);
        const locked = s.officeStage < it.minStage ? `Needs ${OFFICE_STAGES[it.minStage]?.name ?? 'a bigger office'}`
          : it.requires === 'award' && (s.stats?.awards ?? 0) < 1 ? 'Needs an award first' : null;
        const buy = h('button.btn.small.primary', { onclick: () => { if (ctx.act({ type: 'buyItem', itemId: it.id }).ok) ctx.sfx('coin'); } },
          `${owned.length ? 'Buy another' : 'Buy'} ${fmtMoney(it.costs[0])}`);
        const why = h('span.why.small');
        bind((st) => {
          const r = locked ?? (owned.length >= 2 ? 'You already have two' : st.items.length >= slots ? 'No free item slots' : st.cash < it.costs[0] ? 'Not enough cash' : '');
          buy.disabled = !!r;
          setText(why, r);
        });
        const copies = owned.map((o, idx) => {
          const nextCost = o.level < 3 ? it.costs[o.level] : null;
          const up = h('button.btn.small.blue', { disabled: nextCost === null, onclick: () => { if (ctx.act({ type: 'upgradeItem', id: o.id }).ok) ctx.sfx('coin'); } },
            nextCost === null ? 'Max level' : `Upgrade ${fmtMoney(nextCost)}`);
          bind((st) => { if (nextCost !== null) up.disabled = st.cash < nextCost; });
          return h('div.copy', null,
            h('div.row', null, pips(o.level), h('b.small', { text: idx === 1 ? 'Second copy (half effect)' : `Level ${o.level}` })),
            h('div.small', { text: `Now: ${effectWords(it.effects[o.level - 1])}` }),
            nextCost !== null ? h('div.small.muted', { text: `Next: ${effectWords(it.effects[o.level])}` }) : null,
            h('div.row', null, up, h('span.spacer'),
              confirmButton(`Sell ${fmtMoney(refund(it, o.level))}`, 'Sell? Click again', 'small', () => ctx.act({ type: 'sellItem', id: o.id }))));
        });
        const card = h('div.card.item', null,
          h('div.row', null, h('span.iico', null, icon(`item.${it.id}`, { size: 30 })), h('div', { style: { minWidth: 0 } },
            h('b.iname', { text: it.name }), h('div.small.muted', { text: it.desc }))),
          owned.length ? null : h('div.small', null, h('b', { text: 'Level 1: ' }), effectWords(it.effects[0])),
          ...copies,
          owned.length < 2 ? h('div.row', null, locked ? h('span.pill.warn', null, icon('lock', { size: 12 }), ` ${locked}`) : buy, h('span.spacer'), locked ? null : why) : null);
        toggleClass(card, 'owned', owned.length > 0);
        toggleClass(card, 'locked', !!locked && !owned.length);
        grid.append(card);
      }
      return [upgrade,
        h('div.section', null, h('h3', null, 'Office shop', h('span.aside', { text: 'Items show up in the office. Sell for half of what you paid.' })), grid)];
    });
  return { el: view.el, update: (s, f) => view.update(s, f) };
}
