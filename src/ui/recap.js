// "Welcome back" card shown on Continue: where the company stands, what is waiting, and what
// happened most recently. Everything is read from the loaded state; nothing is stored for it.
import { h, fmtMoney, fmtNum, dateOf } from './dom.js';
import { icon } from './icons.js';
import { capacityOf } from './content.js';
import { ERA, ERAS, GOAL, incidentLabel } from './v2content.js';
import { needsYou, weeklyNet, liveProducts, totalMrr, totalCustomers } from './hud.js';

const RECENT = 4;

const when = (week, now) => {
  const ago = now - week;
  return ago <= 0 ? 'this week' : ago === 1 ? 'last week' : ago < 9 ? `${ago} weeks ago` : `${dateOf(week).year} Q${dateOf(week).quarter}`;
};

// The most recent notable moments: launches, era arrivals, goals, and incidents, newest first.
export function recentMoments(s) {
  const out = [];
  for (const p of s.products ?? []) {
    if (Number.isFinite(p.launchedWeek)) out.push({ week: p.launchedWeek, icon: 'launch', text: `Launched ${p.name}${p.killed ? ' (since retired)' : ''}` });
  }
  if (s.eraSchedule) {
    for (const e of ERAS) {
      const at = e.id === s.era?.id ? s.era.since : s.eraSchedule[e.id];
      if (Number.isFinite(at) && at > 0 && at <= s.week && ERAS.indexOf(e) <= ERAS.findIndex((x) => x.id === s.era?.id)) {
        out.push({ week: at, icon: 'clock', text: `A new era: ${e.name}` });
      }
    }
  }
  for (const [id, g] of Object.entries(s.goals ?? {})) {
    if (g.done && Number.isFinite(g.week)) out.push({ week: g.week, icon: 'star', text: `Goal: ${GOAL[id]?.name ?? id}` });
  }
  for (const inc of s.incidentLog ?? []) {
    const prod = s.products?.find((p) => p.id === inc.productId);
    const what = incidentLabel(s, inc.kind, 'Incident');
    out.push({ week: inc.week, icon: inc.caught ? 'caught' : 'incident', text: inc.caught ? `Caught before it hurt: ${what.toLowerCase()}${prod ? ` on ${prod.name}` : ''}` : `${what}${prod ? ` on ${prod.name}` : ''}` });
  }
  out.sort((a, b) => b.week - a.week);
  if (out.length < 2) {
    // A quiet save: fall back to the latest #wins lines.
    for (const c of [...(s.chatLog ?? [])].reverse()) {
      if (c.type === 'say' || c.channel !== 'wins' || !c.text) continue;
      out.push({ week: c.week ?? s.week, icon: 'toast.good', text: c.text });
      if (out.length >= RECENT) break;
    }
  }
  return out.slice(0, RECENT);
}

function tile(label, value, sub, cls = '') {
  return h(`div.rtile${cls ? `.${cls}` : ''}`, null, h('div.rl', { text: label }), h('div.rv.num', { text: value }), sub ? h('div.rs', { text: sub }) : null);
}

export function openRecap(ctx) {
  const s = ctx.getState();
  if (!s || s.gameOver) return;
  const d = dateOf(s.week);
  const net = weeklyNet(s);
  const runway = s.cash < 0 ? 'In the red' : net !== null && net < 0 ? `${Math.floor(s.cash / -net)} wk runway` : 'Cash is growing';
  const live = liveProducts(s);
  const cap = capacityOf(s);
  const era = ERA[s.era?.id];
  const waiting = [
    s.pendingDecision ? { icon: 'decision', text: `Decision: ${s.pendingDecision.title}` } : null,
    ...needsYou(s).slice(0, 4).map((n) => ({ icon: n.icon, text: n.text })),
  ].filter(Boolean);
  const moments = recentMoments(s);

  let close = null;
  const go = h('button.btn.go.big', { onclick: () => close?.() }, icon('speed.play'), ' Back to work');
  setTimeout(() => go.focus(), 0);
  const body = h('div.recap', null,
    h('div.rhead', null,
      h('div.rlogo', { style: { background: s.founding?.logoColor ?? '' }, text: (s.companyName || '?').slice(0, 1).toUpperCase() }),
      h('div', null, h('b.rname', { text: s.companyName || 'Your company' }),
        h('div.small.muted', { text: `${d.year} · Q${d.quarter} · Week ${d.week}` })),
      h('span.spacer'),
      era ? h('span.pill.ink', null, icon('clock', { size: 12 }), ` ${era.name}`) : null),
    h('div.rtiles', null,
      tile('Cash', fmtMoney(s.cash), runway, s.cash < 0 ? 'bad' : ''),
      tile('MRR', fmtMoney(totalMrr(s)), `${fmtNum(totalCustomers(s))} customers`),
      tile('Team', `${s.staff.length}`, s.office?.placed ? `${cap} desk${cap === 1 ? '' : 's'}` : `of ${cap} seats`),
      tile('Products', `${live.length}`, live.length ? live.slice(0, 3).map((p) => p.name).join(', ') : 'Nothing shipped yet')),
    waiting.length ? h('div.rsec', null, h('h3', { text: 'Waiting on you' }),
      h('div.rlist', null, ...waiting.map((w) => h('div.ritem.warn', null, icon(w.icon, { size: 14 }), h('span', { text: w.text }))))) : null,
    moments.length ? h('div.rsec', null, h('h3', { text: 'Last time' }),
      h('div.rlist', null, ...moments.map((m) => h('div.ritem', null, icon(m.icon, { size: 14 }), h('span', { text: m.text }), h('span.rwhen', { text: when(m.week, s.week) }))))) : null,
    h('div.row', null, h('span.small.muted', { text: 'The game is paused until you close this.' }), h('span.spacer'), go));
  // The recap goes first: decision, launch, era, and unlock popups wait behind it until it closes.
  const layer = document.querySelector('.hitl');
  layer?.classList.add('recapping');
  close = ctx.openModal({ title: 'Welcome back', iconName: 'continue', body, cls: 'recapm', onClose: () => layer?.classList.remove('recapping') });
}
