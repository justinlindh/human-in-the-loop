import { setTip } from '../tooltip.js';
import { h, setText, toggleClass, fmtMoney } from '../dom.js';
import { B, capacityOf, OFFICE_STAGES } from '../content.js';
import { portrait, roleChip, seniorityChip, traitChips, liveView } from '../widgets.js';
import { icon } from '../icons.js';
import { STATS, roleSkills, bestSkill, strengthChip, skillRow } from '../stats.js';
import { CATALOG } from '../v2content.js';
import { firstFit } from '../placement.js';

export const DESK_ITEM = 'desk';
export const deskCost = () => CATALOG[DESK_ITEM]?.costs?.[0] ?? 0;

// Whether a new desk fits anywhere on the floor, in any rotation.
export const deskFits = (s) => [0, 1].some((rot) => !!firstFit(s, DESK_ITEM, rot));

export function hireFee(c) {
  return (c.salary ?? 0) * (B.hireFeeWeeks ?? 2);
}

// Desks to place before one more person can start, in an office the player lays out. Usually 1;
// more when people already lack desks (the founders in an empty garage).
export const desksNeeded = (s) => (s.office?.placed ? Math.max(0, s.staff.length + 1 - capacityOf(s)) : 0);
export const needsDesk = (s) => desksNeeded(s) > 0;
const deskWords = (n) => (n === 1 ? 'a desk' : `${n} desks`);

// Why Hire can't go ahead. With no free desk, the cost of the desk counts too; room is the
// caller's deskFits result, which is only worked out when the panel rebuilds.
export function hireBlocker(s, c, room = true) {
  if (needsDesk(s)) {
    if (!room) return 'No room for a desk';
    const n = desksNeeded(s);
    const total = n * deskCost() + hireFee(c);
    if (s.cash < total) return `Need ${fmtMoney(total)} for ${n === 1 ? 'desk' : `${n} desks`} and fee`;
    return null;
  }
  if (s.staff.length >= capacityOf(s)) return 'Office is full';
  if (s.cash < hireFee(c)) return 'Not enough cash';
  return null;
}

// Desk placement straight from the hiring screen or a Yak reply. onPlaced runs once a desk is down.
export function enterDeskPlacement(ctx, { label = 'Place a desk', onPlaced = null, onCancel = null } = {}) {
  if (!ctx.build?.enter) { ctx.open('office'); return; }
  ctx.build.enter(DESK_ITEM, { label, onPlaced, onCancel });
}

// Place the desks c needs, then hire c. Leaving placement early cancels the hire (no fee is charged;
// desks already placed stay).
export function hireWithDesk(ctx, c) {
  const n = desksNeeded(ctx.getState());
  enterDeskPlacement(ctx, {
    label: n > 1 ? `Desk for ${c.name} (${n} to go)` : `Desk for ${c.name}`,
    onPlaced: () => {
      if (needsDesk(ctx.getState())) { hireWithDesk(ctx, c); return; }
      // The candidate list or the cash can change while the player places desks; say why the hire failed.
      const gone = !ctx.getState().candidates.some((x) => x.id === c.id);
      const res = gone ? { ok: false } : ctx.act({ type: 'hire', candidateId: c.id }, { quiet: true });
      if (res.ok) ctx.sfx('coin');
      else {
        const why = (res.reason ?? 'That did not work').replace(/^./, (m) => m.toLowerCase());
        ctx.toast(gone ? `${c.name} is no longer a candidate. The desk stays.` : `Couldn't hire ${c.name}: ${why}. The desk stays.`, 'warn');
        ctx.sfx('error');
      }
      ctx.open('staff', { tab: 'hire' });
    },
    onCancel: () => { ctx.toast(`Hiring ${c.name} cancelled`); ctx.open('staff', { tab: 'hire' }); },
  });
}

export function hireView(ctx) {
  return liveView(
    (s) => `${s.candidates.map((c) => c.id).join()}|${s.staff.length}|${s.officeStage}|${capacityOf(s)}|${s.office?.placed?.length ?? ''}|${s.office?.expansion ?? ''}`,
    (s, bind) => {
      const cap = capacityOf(s);
      const room = needsDesk(s) ? deskFits(s) : true;
      const nextIn = Math.max(0, (s.candidatesWeek ?? s.week) + (B.candidateRefreshWeeks ?? 4) - s.week);
      const seatsT = h('span');
      const seats = h('span.pill', null, icon('seat'), ' ', seatsT);
      bind((st) => setText(seatsT, `${st.staff.length}/${cap} seats`));
      const header = h('div.row.wrap.summaryline', null, seats,
        h('span.pill', null, icon('refresh'), nextIn > 0 ? ` New candidates in ${nextIn}w` : ' New candidates soon'),
        needsDesk(s) && room
          ? h('button.btn.small.primary', { onclick: () => { ctx.sfx('click'); enterDeskPlacement(ctx); } }, icon('office'), ` Add a desk · ${fmtMoney(deskCost())}`)
          : s.staff.length >= cap && (s.office?.placed || s.officeStage < OFFICE_STAGES.length - 1)
            ? h('button.btn.small.primary', { onclick: () => ctx.open('office') }, icon('office'), ' Need more seats? Office') : null,
        h('span.spacer'),
        h('span.small.muted', { text: `Hiring fee is ${B.hireFeeWeeks ?? 2} weeks of salary.` }));
      if (!s.candidates.length) return [header, h('div.empty', { text: 'No candidates right now. Check back soon.' })];
      const grid = h('div.cands');
      for (const c of s.candidates) {
        const btnT = h('span', { text: 'Hire' });
        const btn = h('button.btn.go', {
          onclick: () => {
            const st = ctx.getState();
            if (needsDesk(st)) { ctx.sfx('click'); hireWithDesk(ctx, c); return; }
            if (ctx.act({ type: 'hire', candidateId: c.id }).ok) ctx.sfx('coin');
          },
        }, btnT);
        const why = h('span.why.small');
        bind((st) => {
          const r = hireBlocker(st, c, room);
          const desk = needsDesk(st);
          btn.disabled = !!r;
          setText(btnT, !desk ? 'Hire' : !r ? 'Hire + desk' : room ? 'Can\'t afford desk' : 'No room');
          const n = desksNeeded(st);
          setText(why, r ?? (desk ? `Place ${deskWords(n)} first · ${fmtMoney(n * deskCost())}` : ''));
          toggleClass(why, 'note', !r);
          setTip(btn, r ?? (desk ? `Place ${deskWords(n)}, then hire ${c.name}` : `Hire ${c.name}`));
        });
        grid.append(h('div.card.cand', null,
          h('div.row', null, portrait(c, 64), h('div', null,
            h('b.cname', { text: c.name }),
            h('div.row.wrap', null, roleChip(c.role), seniorityChip(c.seniority), h('span.num.small', { text: `Level ${c.level}` })))),
          h('div.row.wrap', null, strengthChip(c)),
          skillsBlock(c),
          h('div.row.wrap.traits', null, ...(c.traits.length ? traitChips(c.traits) : [h('span.faint.small', { text: 'No notable traits' })])),
          h('div.row.money', null,
            h('div', null, h('div.num.sal', { text: `${fmtMoney(c.salary)}/wk` }), h('div.small.muted.num', { text: `fee ${fmtMoney(hireFee(c))}` })),
            h('span.spacer'), h('div.col.right', null, btn, why))));
      }
      return [header, grid];
    });
}

// The role's top two skills, with a tap-to-expand button for all four.
function skillsBlock(c) {
  const box = h('div.skills2');
  let all = false;
  const render = () => {
    // The headline skill always shows, then the role's key skills, two rows in all.
    const ids = all ? STATS.map((x) => x.id) : [...new Set([bestSkill(c).id, ...roleSkills(c.role)])].slice(0, 2);
    box.replaceChildren(...ids.map((id) => skillRow(id, c.skills[id] ?? 0)),
      h('button.btn.small.skmore', { onclick: () => { all = !all; render(); } }, all ? 'Fewer skills' : 'All skills'));
  };
  render();
  return box;
}
