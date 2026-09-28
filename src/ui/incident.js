// Incidents: a live card while an outage runs (who is on it, when it's back, what it has cost, why it
// happened), and the resolution summary at the all-clear. The summary heads the postmortem decision when
// one follows (a severe incident) and otherwise opens from a toast as a card of its own.
import { h, setText, fmtMoney, toggleClass } from './dom.js';
import { icon } from './icons.js';
import { portrait } from './widgets.js';
import { incidentLabel } from './v2content.js';
import { EVENTS, INCIDENT_EVENT } from '../data/events.js';

// Decisions that are an incident's postmortem: the attack follow-up, and every rogue-agent SEV decision
// (raised at the all-clear). An attack's own decision comes at the alarm and isn't one.
export const POSTMORTEM_IDS = new Set(['incident_postmortem',
  ...Object.values(INCIDENT_EVENT).filter((id) => EVENTS[id]?.kind !== 'cyber')]);

const sevText = (severity) => `SEV${6 - severity}`;
const first = (p) => p.name.split(' ')[0];
const sentence = (t) => (t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : '');
const fmtCustomers = (n) => `${Math.round(n).toLocaleString('en-US')}`;

// The cost pills, as short signed strings.
export function costPills(cost = {}) {
  const out = [];
  if (cost.cash) out.push(`-${fmtMoney(Math.abs(cost.cash))}`);
  if (cost.brand) out.push(`Brand -${Math.abs(cost.brand)}`);
  if (cost.customers) out.push(`-${fmtCustomers(cost.customers)} customer${cost.customers === 1 ? '' : 's'}`);
  return out;
}

// The summary block: how long, what it cost, what helped and hurt, and who fixed it.
export function resolutionBlock(s, r) {
  const names = (r.responderIds ?? []).map((id) => s.staff.find((p) => p.id === id)).filter(Boolean).map(first);
  return h('div.incres', null,
    h('div.incpills', null, h('span.pill', { text: `Took ${r.weeks} week${r.weeks === 1 ? '' : 's'}` }), ...costPills(r.cost).map((t) => h('span.pill', { text: t }))),
    (r.helped?.length || r.hurt?.length) ? h('ul.inclines', null,
      ...(r.helped ?? []).map((t) => h('li.good', null, h('b', { text: '+ ' }), t)),
      ...(r.hurt ?? []).map((t) => h('li.bad', null, h('b', { text: '- ' }), t))) : null,
    names.length ? h('div.small.muted', { text: `Responders: ${names.join(', ')}` }) : null);
}

export const backUpTitle = (s, r) => `${s.products.find((p) => p.id === r.productId)?.name ?? 'The product'} is back up · ${sevText(r.severity)}`;

// Resolutions seen recently, for the postmortem decision that follows one (it may wait behind another decision).
export function createResolutions(max = 6) {
  const list = [];
  const fallbacks = new WeakMap(); // decision -> the summary built from its own vars, one object per decision
  return {
    add(e) { list.push(e); if (list.length > max) list.shift(); },
    // The resolution a postmortem decision is about: its product, newest first.
    // Without a matching resolution, a decision about a product that is still down is not a postmortem.
    forDecision(d, s = null) {
      if (!d || !POSTMORTEM_IDS.has(d.eventId)) return null;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].productId === d.subjectId) return list[i];
      if (s?.outage?.productId === d.subjectId) return null;
      if (!fallbacks.has(d)) {
        const last = s?.flags?.lastIncident?.productId === d.subjectId ? s.flags.lastIncident : null;
        fallbacks.set(d, { productId: d.subjectId, severity: last?.severity ?? null, weeks: d.vars?.incidentWeeks ?? last?.weeks ?? 0,
          cost: d.vars?.incidentCost ?? last?.cost ?? {}, responderIds: d.vars?.incidentResponders ?? last?.responderIds ?? [], helped: [], hurt: [] });
      }
      return fallbacks.get(d);
    },
  };
}

// The live card, top right under the HUD. Hide tucks it away for this incident; the tray's outage card
// brings it back.
export function createIncidentCard({ layer, ctx }) {
  const el = h('div.inccard', { dataset: { occludes: '' }, role: 'status' });
  el.style.display = 'none';
  layer.append(el);
  // Toasts share the top-right column; while the card shows they sit under it (44-incidents.css).
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => layer.style.setProperty('--inc-h', `${el.offsetHeight}px`)).observe(el);
  let key = null, hiddenKey = null, shown = false, binds = [];

  const keyOf = (o) => `${o.productId}|${o.kind}|${o.severity}|${o.unrecoverable ? 1 : 0}|${(o.responderIds ?? []).join()}`;
  const idOf = (o) => `${o.productId}|${o.kind}`;

  function build(s, o) {
    binds = [];
    const p = s.products.find((x) => x.id === o.productId);
    const people = (o.responderIds ?? []).map((id) => s.staff.find((x) => x.id === id)).filter(Boolean);
    const eta = h('span.pill.inceta');
    const cash = h('b.num'), brand = h('b.num'), cust = h('b.num'), weeks = h('span.small.muted');
    binds.push((st) => {
      const c = st.outage;
      if (!c) return;
      setText(eta, c.unrecoverable ? 'Nobody here can fix it' : c.etaWeeks == null ? 'Working on it' : c.etaWeeks <= 1 ? 'Back in ~1 wk' : `Back in ~${c.etaWeeks} wk`);
      toggleClass(eta, 'bad', !!c.unrecoverable);
      setText(cash, c.cost?.cash ? `-${fmtMoney(Math.abs(c.cost.cash))}` : '$0');
      setText(brand, c.cost?.brand ? `-${Math.round(Math.abs(c.cost.brand) * 10) / 10}` : '0');
      setText(cust, c.cost?.customers ? `-${fmtCustomers(c.cost.customers)}` : '0');
      setText(weeks, c.weeks ? `Down ${c.weeks} week${c.weeks === 1 ? '' : 's'}` : 'Down this week');
    });
    const who = people.length
      ? h('div.incwho', null, h('span.small.muted', { text: 'On it:' }), ...people.map((x) => h('button.incface', { type: 'button', title: `${x.name}: responding`, onclick: () => ctx.open('staff', { staffId: x.id }) },
        portrait(x, 28), h('span', { text: first(x) }))))
      : h('div.small.bad-t', { text: 'Nobody is free to respond.' });
    el.replaceChildren(...[
      h('div.inchead', null, h('span.pill.incsev', null, icon('tray.outage', { size: 13 }), ` ${sevText(o.severity)}`),
        h('b.inctitle', { text: `${p?.name ?? 'A product'} is down` }), h('span.spacer'), weeks),
      // The cause usually names the kind already ("ransomware got past..."); the label shows when it doesn't.
      o.cause && o.cause.toLowerCase().startsWith(incidentLabel(s, o.kind, '').toLowerCase()) ? null : h('div.small.inckind', { text: incidentLabel(s, o.kind, 'Outage') }),
      o.cause ? h('div.small.inccause', { text: sentence(o.cause) }) : null,
      h('div.incrow', null, who, h('span.spacer'), eta),
      h('div.inccosts', null,
        h('div.inccost', null, h('span.small', { text: 'Cash so far' }), cash),
        h('div.inccost', null, h('span.small', { text: 'Brand' }), brand),
        h('div.inccost', null, h('span.small', { text: 'Customers' }), cust)),
      h('div.incfoot', null,
        o.unrecoverable ? h('span.small.bad-t', { text: 'Consultants in Ops can fix it, at a price.' }) : h('span.small.muted', { text: 'Responders leave their work until it is fixed.' }),
        h('span.spacer'),
        h('button.btn.small', { type: 'button', onclick: () => ctx.open('ops') }, o.unrecoverable ? 'Call for help' : 'Ops'),
        h('button.btn.small', { type: 'button', onclick: () => { hiddenKey = idOf(o); apply(false); ctx.sfx?.('click'); } }, 'Hide')),
    ].filter(Boolean));
  }

  function apply(on) {
    if (on === shown) return;
    shown = on;
    el.style.display = on ? '' : 'none';
    layer.classList.toggle('incident-open', on);
  }

  return {
    // covered: a panel, modal or card is over the scene.
    update(s, covered = false) {
      const o = s.outage;
      if (!o) { key = null; hiddenKey = null; apply(false); return; }
      const k = keyOf(o);
      if (k !== key) { key = k; build(s, o); }
      for (const b of binds) b(s);
      apply(!covered && hiddenKey !== idOf(o));
    },
    // Brings a hidden card back (the tray's outage card).
    reveal() { hiddenKey = null; },
    get hidden() { return hiddenKey != null; },
    get open() { return shown; },
  };
}
