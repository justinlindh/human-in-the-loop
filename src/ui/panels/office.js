import { h, setText, fmtMoney, toggleClass } from '../dom.js';
import { OFFICE_STAGES } from '../content.js';
import { liveView } from '../widgets.js';
import { icon } from '../icons.js';

export function officePanel(ctx) {
  const view = liveView(
    (s) => `${s.officeStage}|${s.staff.length}`,
    (s, bind) => {
      const cur = OFFICE_STAGES[s.officeStage];
      const next = OFFICE_STAGES[s.officeStage + 1];
      const track = h('div.stages', null, ...OFFICE_STAGES.map((st, i) => {
        const el = h('div.stage', null,
          h('div.snum', { text: String(i + 1) }),
          h('b', { text: st.name }),
          h('div.small.muted', { text: `${st.capacity} seats · ${fmtMoney(st.rent)}/wk rent` }));
        toggleClass(el, 'done', i < s.officeStage);
        toggleClass(el, 'here', i === s.officeStage);
        return el;
      }));
      const used = s.staff.length;
      const full = used >= cur.capacity;
      let upgrade;
      if (next) {
        const btn = h('button.btn.go.big', { onclick: () => { if (ctx.act({ type: 'upgradeOffice' }).ok) ctx.sfx('confirm'); } },
          icon('office'), ` Move to ${next.name} for ${fmtMoney(next.upgradeCost)}`);
        const why = h('span.why.small');
        bind((st) => {
          const r = st.cash < next.upgradeCost ? `Not enough cash (${fmtMoney(st.cash)} of ${fmtMoney(next.upgradeCost)})` : '';
          btn.disabled = !!r;
          setText(why, r);
        });
        upgrade = h('div.card.upgrade', null,
          h('b', { text: `Next: ${next.name}` }),
          h('div.row.wrap', null,
            h('span.pill.good', null, icon('seat', { size: 12 }), ` ${next.capacity} seats (+${next.capacity - cur.capacity})`),
            h('span.pill.warn', null, icon('rent', { size: 12 }), ` Rent ${fmtMoney(next.rent)}/wk (+${fmtMoney(next.rent - cur.rent)})`),
            next.itemSlots ? h('span.pill', { text: `${next.itemSlots} item slots` }) : null),
          h('div.small.muted', { text: 'Bigger offices unlock large projects and the fancier marketing channels.' }),
          btn, why);
      } else {
        upgrade = h('div.card.upgrade', null, h('b', { text: 'You are in the biggest office in town.' }));
      }
      return [
        h('div.officehead', null,
          h('div', null, h('div.small.muted', { text: 'Current office' }), h('h2.oname', { text: cur.name })),
          h('span', { class: full ? 'pill bad' : 'pill' }, icon('seat', { size: 12 }), ` ${used}/${cur.capacity} seats used`),
          h('span.pill', null, icon('rent', { size: 12 }), ` ${fmtMoney(cur.rent)}/wk rent`)),
        track,
        upgrade,
      ];
    });
  return { el: view.el, update: (s, f) => view.update(s, f) };
}
