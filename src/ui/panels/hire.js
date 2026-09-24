import { h, setText, fmtMoney } from '../dom.js';
import { B, capacityOf, OFFICE_STAGES } from '../content.js';
import { portrait, roleChip, seniorityChip, traitChips, liveView } from '../widgets.js';
import { icon } from '../icons.js';
import { STAT_INFO } from './build.js';

export function hireFee(c) {
  return (c.salary ?? 0) * (B.hireFeeWeeks ?? 2);
}

export function hireBlocker(s, c) {
  if (s.staff.length >= capacityOf(s)) return s.office?.placed ? 'No free desk' : 'Office is full';
  if (s.cash < hireFee(c)) return 'Not enough cash';
  return null;
}

export function hireView(ctx) {
  return liveView(
    (s) => `${s.candidates.map((c) => c.id).join()}|${s.staff.length}|${s.officeStage}|${capacityOf(s)}`,
    (s, bind) => {
      const cap = capacityOf(s);
      const nextIn = Math.max(0, (s.candidatesWeek ?? s.week) + (B.candidateRefreshWeeks ?? 4) - s.week);
      const seatsT = h('span');
      const seats = h('span.pill', null, icon('seat'), ' ', seatsT);
      bind((st) => setText(seatsT, `${st.staff.length}/${cap} seats`));
      const header = h('div.row.wrap.summaryline', null, seats,
        h('span.pill', null, icon('refresh'), nextIn > 0 ? ` New candidates in ${nextIn}w` : ' New candidates soon'),
        s.staff.length >= cap && (s.office?.placed || s.officeStage < OFFICE_STAGES.length - 1)
          ? h('button.btn.small.primary', { onclick: () => ctx.open('office') }, icon('office'), s.office?.placed ? ' Place another desk' : ' Need more seats? Office') : null,
        h('span.spacer'),
        h('span.small.muted', { text: `Hiring fee is ${B.hireFeeWeeks ?? 2} weeks of salary.` }));
      if (!s.candidates.length) return [header, h('div.empty', { text: 'No candidates right now. Check back soon.' })];
      const grid = h('div.cands');
      for (const c of s.candidates) {
        const btn = h('button.btn.go', { onclick: () => { if (ctx.act({ type: 'hire', candidateId: c.id }).ok) ctx.sfx('coin'); } }, 'Hire');
        const why = h('span.why.small');
        bind((st) => {
          const r = hireBlocker(st, c);
          btn.disabled = !!r;
          setText(why, r ?? '');
          btn.title = r ?? `Hire ${c.name}`;
        });
        grid.append(h('div.card.cand', null,
          h('div.row', null, portrait(c, 64), h('div', null,
            h('b.cname', { text: c.name }),
            h('div.row.wrap', null, roleChip(c.role), seniorityChip(c.seniority), h('span.num.small', { text: `Lv${c.level}` })))),
          h('div.skills', null, ...STAT_INFO.map((st) => h('div.pstat', { title: st.name }, h('span', { text: st.short }),
            h('div.bar', null, h('i', { style: { width: `${c.skills[st.id]}%`, background: st.color } })), h('b.num', { text: c.skills[st.id] })))),
          h('div.row.wrap.traits', null, ...(c.traits.length ? traitChips(c.traits) : [h('span.faint.small', { text: 'No notable traits' })])),
          h('div.row.money', null,
            h('div', null, h('div.num.sal', { text: `${fmtMoney(c.salary)}/wk` }), h('div.small.muted.num', { text: `fee ${fmtMoney(hireFee(c))}` })),
            h('span.spacer'), h('div.col.right', null, btn, why))));
      }
      return [header, grid];
    });
}
