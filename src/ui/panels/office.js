import { h, setText, fmtMoney, toggleClass } from '../dom.js';
import { OFFICE_STAGES } from '../content.js';
import { ITEMS } from '../../data/items.js';
import { liveView, confirmButton } from '../widgets.js';
import { icon } from '../icons.js';
import { CATALOG, isDesk, beforeEra } from '../v2content.js';
import { placedOf, stageOf } from '../placement.js';
import { EVENTS } from '../../data/events.js';
import { weeklyCosts } from '../../sim/economy.js';
import { call, SIMX } from '../simapi.js';

const EFFECT_LABEL = {
  staminaRecovery: 'stamina recovery', meaningRecovery: 'meaning recovery', burnoutResign: 'burnout resignations',
  output: 'output', staminaDrain: 'stamina drain', novelty: 'freshness', knowledgeGain: 'knowledge gain',
  oversight: 'oversight per person', maintenanceNeed: 'maintenance need', uptimeFloor: 'minimum uptime', brandDecay: 'brand decay',
};

// Plain words for an effects map, for example "+15% stamina recovery, -2% output".
export function effectWords(effects, scale = 1) {
  return Object.entries(effects ?? {}).map(([k, v0]) => {
    const v = v0 * scale;
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
  if (!ctx.getState().office?.placed) return legacyOfficePanel(ctx);
  return buildPalette(ctx);
}

// The fixed-slot shop, for a state without office.placed.
function legacyOfficePanel(ctx) {
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
        bind((st) => { const r = moveBlocker(st, next); btn.disabled = !!r; setText(why, r); btn.title = r; });
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
            h('div.small', { text: `Now: ${effectWords(it.effects[o.level - 1], idx === 1 ? 0.5 : 1)}` }),
            nextCost !== null ? h('div.small.muted', { text: `Next: ${effectWords(it.effects[o.level], idx === 1 ? 0.5 : 1)}` }) : null,
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

// Why the move to the next office is blocked (the sim's stage gate, then cash), or ''.
function moveBlocker(s, next) {
  const gate = call('officeGateReason', s, next);
  if (gate) return gate;
  return s.cash < next.upgradeCost ? 'Not enough cash' : '';
}

const MAX_EXPANSION = 3;
const EXPANSION_DESKS = 5;
// The HQ desk cap (30 + 5 per expansion step), or null outside the HQ or before the sim has expansions.
function deskCapOf(s) {
  const c = call('deskCap', s);
  if (Number.isFinite(c)) return c;
  return stageOf(s) === 2 && Number.isFinite(s.office?.expansion) ? 30 + EXPANSION_DESKS * s.office.expansion : null;
}

// Rent as the sim charges it (the work policy can discount it).
function rentOf(s, stage) {
  try { const r = weeklyCosts(s).rent; if (Number.isFinite(r)) return r; } catch { /* fall back to the list price */ }
  return stage.rent;
}

// The trade-offs come from the sim's work_policy decision choices; the card names the standing state.
const POLICY_NAME = { office: 'Office-first', hybrid: 'Hybrid', remote: 'Remote-first' };
const WORK_POLICY = (() => {
  const ev = EVENTS.work_policy ?? Object.values(EVENTS).find((e) => e.id === 'work_policy');
  const out = {};
  for (const c of ev?.choices ?? []) if (c.effects?.workPolicy) out[c.effects.workPolicy] = { name: POLICY_NAME[c.effects.workPolicy] ?? c.label, tip: c.hint ?? '' };
  return out;
})();

const ADJ_WORDS = { novelty: 'freshness', staminaRecovery: 'stamina recovery', meaningRecovery: 'meaning recovery', uptimeFloor: 'minimum uptime', knowledgeGain: 'knowledge gain' };

function adjacencyLine(it) {
  const a = it.adjacency;
  if (!a) return null;
  const val = a.key === 'uptimeFloor' ? `+${Math.round(a.value * 100)} pts` : `+${Math.round(a.value * 100)}%`;
  const to = a.to ? `${CATALOG[a.to]?.name ?? a.to}s` : 'desks';
  return `Nearby ${to} (within ${a.radius} tile${a.radius === 1 ? '' : 's'}): ${val} ${ADJ_WORDS[a.key] ?? a.key}`;
}

// The Office panel as a build palette: the stage card, then furniture and shop items to place.
function buildPalette(ctx) {
  const view = liveView(
    (s) => `${s.era?.id}|${s.workPolicy}|${stageOf(s)}|${s.office?.expansion}|${s.staff.length}|${placedOf(s).map((p) => `${p.id}${p.level}`).join()}|${s.stats?.awards ?? 0}`,
    (s, bind) => {
      const stageIx = stageOf(s);
      const stage = OFFICE_STAGES[stageIx];
      const next = OFFICE_STAGES[stageIx + 1];
      const placed = placedOf(s);
      const desks = placed.filter((p) => isDesk(p.itemId)).length;
      const full = s.staff.length >= desks;
      const cap = deskCapOf(s);

      const pills = h('div.row.wrap', null,
        h('span', { class: full ? 'pill warn' : 'pill good', title: 'Each desk set seats one person. Hiring needs a free desk.' },
          icon('seat', { size: 12 }), s.staff.length > desks
            ? ` ${desks} desk${desks === 1 ? '' : 's'} for ${s.staff.length} ${s.staff.length === 1 ? 'person' : 'people'}`
            : ` ${s.staff.length}/${desks} desks used`),
        h('span.pill', null, icon('rent', { size: 12 }), ` ${fmtMoney(rentOf(s, stage))}/wk rent`),
        cap !== null ? h('span', { class: desks >= cap ? 'pill warn' : 'pill', title: 'The most desks this office can hold' }, icon('office', { size: 12 }), desks >= cap ? ' Desk limit reached' : ` Desk limit ${cap}`) : null,
        s.workPolicy ? h('span.pill.policy', null, icon('home', { size: 12 }), ` ${WORK_POLICY[s.workPolicy]?.name ?? s.workPolicy}`) : null);
      let right;
      if (next) {
        const btn = h('button.btn.go', { onclick: () => { if (ctx.act({ type: 'upgradeOffice' }).ok) ctx.sfx('confirm'); } },
          icon('office'), ` Move to ${next.name} · ${fmtMoney(next.upgradeCost)}`);
        const why = h('span.why.small');
        bind((st) => { const r = moveBlocker(st, next); btn.disabled = !!r; setText(why, r); btn.title = r; });
        right = h('div.col.right', null,
          h('div.small.muted', { text: `${next.name}: more floor, ${fmtMoney(rentOf({ ...s, officeStage: stageIx + 1, office: s.office ? { ...s.office, stage: stageIx + 1 } : s.office }, next))}/wk rent. Your furniture comes along.` }), btn, why);
      } else if (Number.isFinite(s.office?.expansion)) {
        // At the HQ: expansion steps raise the desk cap. The next step comes from the sim, else the stage data.
        const step = s.office.expansion;
        const steps = stage.expansions ?? null;
        const nextStep = call('nextExpansion', s) ?? steps?.[step] ?? null;
        const maxSteps = steps?.length ?? MAX_EXPANSION;
        if (step >= maxSteps || (SIMX.nextExpansion && !nextStep)) right = h('span.small.muted', { text: 'The biggest office in town, fully expanded.' });
        else {
          const cost = nextStep?.upgradeCost ?? call('expansionCost', s);
          const btn = h('button.btn.go', { onclick: () => { if (ctx.act({ type: 'upgradeOffice' }).ok) ctx.sfx('confirm'); } },
            icon('office'), ` ${nextStep?.name ? `Build the ${nextStep.name}` : 'Expand the HQ'}${Number.isFinite(cost) ? ` · ${fmtMoney(cost)}` : ''}`);
          const why = h('span.why.small');
          bind((st) => {
            const gate = nextStep ? call('officeGateReason', st, nextStep) : call('officeGateReason', st, stageIx);
            const r = gate ?? (Number.isFinite(cost) && st.cash < cost ? 'Not enough cash' : '');
            btn.disabled = !!r; setText(why, r ?? ''); btn.title = r ?? '';
          });
          right = h('div.col.right', null,
            h('div.small.muted', { text: `Step ${step + 1} of ${maxSteps}: room for ${EXPANSION_DESKS} more desks${Number.isFinite(nextStep?.rent) ? `, ${fmtMoney(nextStep.rent)}/wk more rent` : ''}.` }), btn, why);
        }
      } else right = h('span.small.muted', { text: 'The biggest office in town.' });
      const policyTip = s.workPolicy && WORK_POLICY[s.workPolicy]?.tip ? h('div.small.muted.policytip', { text: WORK_POLICY[s.workPolicy].tip }) : null;
      const stageCard = h('div.card.stagecard', null,
        h('div', null, h('div.small.muted', { text: 'Your office' }), h('h2.oname', { text: stage.name })),
        h('div.col', null, pills, policyTip), h('span.spacer'), right);

      const hint = !desks ? h('div.starterhint', null, icon('seat', { size: 18 }), 'Start with desks: nobody can work (or be hired) without one.') : null;

      const card = (it) => {
        const mine = placed.filter((p) => p.itemId === it.id);
        const price = it.costs?.[0] ?? 0;
        const locked = stageIx < (it.minStage ?? 0) ? `Needs ${OFFICE_STAGES[it.minStage]?.name ?? 'a bigger office'}`
          : it.requires === 'award' && (s.stats?.awards ?? 0) < 1 ? 'Needs an award first' : null;
        const f = it.footprint ?? { w: 1, h: 1 };
        const btn = h('button.btn.small.primary', { onclick: () => { ctx.sfx('click'); ctx.build?.enter(it.id); } }, icon('menu.build', { size: 14 }), ` Place · ${fmtMoney(price)}`);
        const why = h('span.why.small');
        if (!locked) bind((st) => {
          const atCap = isDesk(it.id) && deskCapOf(st) !== null && placedOf(st).filter((p) => isDesk(p.itemId)).length >= deskCapOf(st);
          const r = atCap ? 'Desk limit reached' : st.cash < price ? 'Not enough cash' : '';
          btn.disabled = !!r; setText(why, r);
        });
        const eff = it.effects?.[0] && Object.keys(it.effects[0]).length ? effectWords(it.effects[0]) : null;
        const adj = adjacencyLine(it);
        const c = h('div.card.item.pal', null,
          h('div.row', null, h('span.iico', null, icon(`item.${it.id}`, { size: 30 })),
            h('div', { style: { minWidth: 0, flex: 1 } },
              h('div.row', null, h('b.iname', { text: it.name }), h('span.spacer'), h('span.pill.num', { title: 'Footprint in tiles', text: `${f.w}x${f.h}` })),
              h('div.small.muted', { text: it.desc ?? '' }))),
          eff ? h('div.small', null, h('b', { text: it.costs?.length > 1 ? 'Level 1: ' : 'Effect: ' }), eff) : null,
          adj ? h('div.small.adj', null, icon('team', { size: 12 }), ` ${adj}`) : null,
          mine.length ? h('div.row.wrap.placedrow', null,
            h('span.small.muted', { text: `Placed: ${mine.length}` }),
            ...(it.kind === 'furniture' ? [] : mine.slice(0, 6)).map((p, i) => h('button.btn.small', { title: 'Move, upgrade, or sell', onclick: () => ctx.build?.openItemCard(p.id) },
              it.costs?.length > 1 ? `#${i + 1} Lv ${p.level ?? 1}` : `#${i + 1}`))) : null,
          h('div.row', null, locked ? h('span.pill.warn', null, icon('lock', { size: 12 }), ` ${locked}`) : btn, h('span.spacer'), locked ? null : why));
        toggleClass(c, 'locked', !!locked);
        return c;
      };

      // Items about AI work (era-tagged) stay hidden until their era.
      const all = Object.values(CATALOG).filter((it) => !beforeEra(s, it.era));
      const furniture = all.filter((it) => it.kind === 'furniture').sort((a, b) => (isDesk(b.id) ? 1 : 0) - (isDesk(a.id) ? 1 : 0));
      const shop = all.filter((it) => it.kind !== 'furniture');
      return [stageCard, hint,
        h('div.section', null, h('h3', null, 'Furniture', h('span.aside', { text: 'Click a spot on the floor to place. Click anything placed to move or sell it.' })),
          h('div.shop', null, ...furniture.map(card))),
        h('div.section', null, h('h3', null, 'Office shop', h('span.aside', { text: 'Upgradeable. Sell for half of what you paid.' })),
          h('div.shop', null, ...shop.map(card)))];
    });
  return { el: view.el, update: (st, f) => view.update(st, f) };
}
