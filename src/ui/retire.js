// Retiring: taking an IPO or an open acquisition offer ends the run as a win.
// Availability comes from a sim export when there is one; otherwise it mirrors the sim's IPO rules
// and looks for an open offer in state.
import { h, fmtMoney, fmtNum } from './dom.js';
import { icon } from './icons.js';
import { B } from './content.js';
import { scoreRun } from '../sim/endgame.js';
import { totalMrr } from '../sim/products.js';
import { FUNDING, fundingMult } from './v2content.js';

const SIM = Object.values(import.meta.glob('../sim/*.js', { eager: true }));
const simRetire = SIM.map((m) => m.retireOptions).find((f) => typeof f === 'function') ?? null;

const offerOf = (s) => s.acquisitionOffer ?? s.offers?.acquisition ?? (s.pendingDecision?.eventId === 'acquisition_offer' ? s.pendingDecision : null);

// { ipo: { ok, reason }, acquired: { ok, reason, by? }, any }
export function retireOptions(s) {
  if (simRetire) {
    try {
      const r = simRetire(s);
      if (r) return { ...r, any: !!(r.ipo?.ok || r.acquired?.ok) };
    } catch { /* use the local rules */ }
  }
  if (!s.unlocks && !s.era) return { ipo: { ok: false }, acquired: { ok: false }, any: false };
  const mrr = totalMrr(s);
  const ipoWhy = mrr < B.ipoMrr ? `Needs ${fmtMoney(B.ipoMrr)} MRR` : s.brand < B.ipoBrand ? `Needs brand ${B.ipoBrand}` : (s.office?.stage ?? s.officeStage) !== 2 ? 'Needs the HQ Building' : null;
  const offer = offerOf(s);
  const ipo = { ok: !ipoWhy, reason: ipoWhy };
  const acquired = { ok: !!offer, reason: offer ? null : 'No open offer', by: offer?.acquirer ?? offer?.by ?? null };
  return { ipo, acquired, any: ipo.ok || acquired.ok };
}

export function projectedScore(s) {
  try {
    return scoreRun({ ...s, gameOver: { won: true, reason: 'retired' } });
  } catch {
    return null;
  }
}

const PARTS = { valuation: 'Valuation', brand: 'Brand', wellbeing: 'Team wellbeing', caught: 'Incidents caught', breaches: 'Breaches', resignations: 'Resignations' };

// Confirmation modal with the projected score. Dispatches { type: 'retire' } on confirm.
export function openRetire(ctx) {
  const s = ctx.getState();
  const opts = retireOptions(s);
  const proj = projectedScore(s);
  const f = FUNDING.find((x) => x.id === s.founding?.funding);
  const mult = f ? fundingMult(f) : 1;
  let close = null;
  const confirm = () => {
    const res = ctx.act({ type: 'retire' });
    if (res.ok) { ctx.sfx('confirm'); close?.(); }
  };
  const via = opts.ipo.ok && opts.acquired.ok ? 'an IPO or the open acquisition offer'
    : opts.ipo.ok ? 'an IPO' : 'the acquisition offer';
  const body = h('div.col', { style: { gap: '0.8em' } },
    h('div', { text: `Retire through ${via}. The run ends as a win, the epilogue rolls, and your score is final.` }),
    proj ? h('div.card', null,
      h('div.small.muted', { text: 'Projected score' }),
      h('div.scorebig.num', { text: fmtNum(proj.score) }),
      h('div.breakdown', null, ...Object.entries(proj.breakdown ?? {}).flatMap(([k, v]) => [
        h('span', { text: PARTS[k] ?? k }), h(`span.num${v < 0 ? '.neg' : ''}`, { text: `${v < 0 ? '' : '+'}${fmtNum(Math.round(v))}` })])),
      mult < 1 ? h('div.small.muted', { text: `${f.name} funding: score x${mult}.` }) : null) : null,
    h('div.small.muted', { text: 'Or keep playing: the company keeps going, and so can you.' }),
    h('div.row', null,
      h('button.btn.big', { onclick: () => close?.() }, 'Keep playing'),
      h('span.spacer'),
      h('button.btn.go.big', { onclick: confirm }, icon('award'), ' Retire')));
  close = ctx.openModal({ title: 'Retire?', iconName: 'award', body, cls: 'small' });
}

// The Reports banner: shown only while retiring is possible.
export function retireBanner(ctx, s) {
  const opts = retireOptions(s);
  if (!opts.any) return null;
  const what = [opts.ipo.ok ? 'An IPO is on the table.' : null, opts.acquired.ok ? `${opts.acquired.by ?? 'A buyer'} has an open offer.` : null].filter(Boolean).join(' ');
  return h('div.card.retirecard', null,
    icon('award', { size: 30 }),
    h('div', null, h('b.big', { text: 'You could retire now' }), h('div.small', { text: what })),
    h('span.spacer'),
    h('button.btn.go', { onclick: () => openRetire(ctx) }, 'Retire...'));
}
