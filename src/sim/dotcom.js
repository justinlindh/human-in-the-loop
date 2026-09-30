import { B } from './balance.js';
import { clamp } from './util.js';
import { pick } from './rng.js';
import { emitChat } from './chat.js';
import { raiseDecision, fireEvent } from './events.js';
import { DOTCOM_CHAT } from '../data/early-eras.js';
import { EVENTS } from '../data/events.js';

export function dotcomDecisionOpen(state, id) {
  if (!id.startsWith('dotcom_')) return true;
  const f = state.flags.dotcom;
  if (!f) return false;
  if (id === 'dotcom_recovery') return f.recovered;
  if (f.recovered || state.era.id !== 'dotcom') return false;
  if (id === 'dotcom_ipo_frenzy') return state.week < B.dotcom.bustWeek && f.float === null;
  if (id === 'dotcom_eyeballs' || id === 'dotcom_warning') return state.week < B.dotcom.bustWeek;
  if (id === 'dotcom_bust') return !f.settled;
  return true;
}

// Financing and settlement are idempotent, including when a queued card survives a save/load.
export function dotcomEffect(ctx, choice) {
  const { state } = ctx;
  const f = state.flags.dotcom;
  if (!f) return;
  if (choice === 'float' || choice === 'private') {
    if (!dotcomDecisionOpen(state, 'dotcom_ipo_frenzy')) return;
    f.float = choice === 'float';
    if (f.float) { state.cash += B.dotcom.floatCash; state.flags.diluted = true; }
    else state.brand = clamp(state.brand + B.dotcom.privateBrand, 0, 100);
  } else if ((choice === 'retain' || choice === 'preserve') && !f.settled && state.week >= B.dotcom.bustWeek) {
    f.settled = true;
    f.settlement = choice;
    if (f.float) state.cash -= Math.min(B.dotcom.floatCostCap, Math.max(0, state.cash) * B.dotcom.floatCashShare);
    const retain = choice === 'retain';
    if (retain) state.cash -= Math.min(B.dotcom.retainCostCap, Math.max(0, state.cash) * B.dotcom.retainCashShare);
    const loss = retain ? B.dotcom.retainLoss : B.dotcom.preserveLoss;
    for (const p of state.products) if (!p.killed) p.customers = Math.max(0, Math.floor(p.customers * (1 - loss)));
  }
}

export function dotcomAcquisition(state) {
  const f = state.flags.dotcom;
  if (state.era.id !== 'dotcom' || !f) return 1;
  if (f.phase === 'bust') return B.dotcom.bustAcquisition;
  if (f.phase === 'boom' || f.phase === 'warning') return B.dotcom.boomAcquisition;
  return 1;
}

// Advance the market on the timeline, independently of how long an ordinary decision waits in the queue.
export function dotcomStep(ctx) {
  const { state } = ctx;
  const f = state.flags.dotcom;
  if (!f || f.recovered) return;
  if (state.era.id === 'dotcom' && state.products.some((p) => p.angle === 'web')) f.webLaunched = true;
  const end = state.eraSchedule.web2 ?? state.eraSchedule.classic;
  const phase = state.week >= end ? 'recovery' : state.week >= B.dotcom.bustWeek ? 'bust'
    : state.week >= B.dotcom.warningWeek ? 'warning' : state.week >= B.dotcom.boomWeek ? 'boom' : 'growth';
  if (phase !== f.phase) { f.phase = phase; f.entered = state.week; }
  const seen = f.seen ??= {};
  if (phase === 'recovery') {
    // A card held by another decision cannot leave an unpaid float or erase the bust's customer loss.
    dotcomEffect(ctx, 'preserve');
    f.recovered = true;
  }
  const milestones = [
    ['dotcom_eyeballs', B.dotcom.boomWeek], ['dotcom_ipo_frenzy', B.dotcom.ipoWeek],
    ['dotcom_warning', B.dotcom.warningWeek], ['dotcom_bust', B.dotcom.bustWeek], ['dotcom_recovery', end],
  ];
  for (const [id, week] of milestones) if (state.week >= week && !seen[id]) {
    seen[id] = true;
    if (dotcomDecisionOpen(state, id)) {
      const ev = EVENTS[id];
      if (ev.choices) raiseDecision(ctx, id, null, { queue: true });
      else {
        fireEvent(ctx, ev, null);
        emitChat(ctx, { channel: 'general', from: '@office', text: `${ev.title}: ${ev.text}`, important: true });
      }
    }
  }
  if (!f.recovered && state.week % B.dotcom.chatterEvery === 0) emitChat(ctx, { channel: 'random', person: pick(ctx.rng, state.staff), text: pick(ctx.rng, DOTCOM_CHAT) });
}
