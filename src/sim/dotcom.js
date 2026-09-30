import { B } from './balance.js';
import { clamp, chapterStart } from './util.js';
import { pick, sideRng } from './rng.js';
import { emitChat } from './chat.js';
import { registerDecisionGate } from './registry.js';
import { raiseDecision, fireEvent } from './events.js';
import { DOTCOM_CHAT } from '../data/early-eras.js';
import { EVENTS } from '../data/events.js';
import { y2kSeason, y2kStep, y2kOnCall } from './y2k.js';

// Weeks since the dot-com chapter began; the boom, IPO, warning and bust weeks in B.dotcom count from there.
export const dotcomWeek = (state) => state.week - (chapterStart(state, 'dotcom') ?? 0);

export function dotcomDecisionOpen(state, id) {
  const f = state.flags.dotcom;
  if (!f) return false;
  if (id === 'dotcom_y2k_oncall') return y2kSeason(state) && !state.flags.y2k?.onCall;
  if (id === 'dotcom_recovery') return f.recovered;
  if (f.recovered || state.era.id !== 'dotcom') return false;
  const beforeBust = dotcomWeek(state) < B.dotcom.bustWeek;
  if (id === 'dotcom_ipo_frenzy') return beforeBust && f.float === null;
  if (id === 'dotcom_eyeballs' || id === 'dotcom_warning') return beforeBust;
  if (id === 'dotcom_bust') return !f.settled;
  return true;
}

for (const id of ['dotcom_ipo_frenzy', 'dotcom_bust', 'dotcom_y2k_oncall']) registerDecisionGate(id, (state) => dotcomDecisionOpen(state, id));

// Financing and settlement are idempotent, including when a queued card survives a save/load.
export function dotcomEffect(ctx, choice) {
  const { state } = ctx;
  const f = state.flags.dotcom;
  if (!f) return;
  if (choice.startsWith('y2k_')) { y2kOnCall(ctx, choice.slice(4)); return; }
  if (choice === 'float' || choice === 'private') {
    if (!dotcomDecisionOpen(state, 'dotcom_ipo_frenzy')) return;
    f.float = choice === 'float';
    if (f.float) { state.cash += B.dotcom.floatCash; state.flags.diluted = true; }
    else state.brand = clamp(state.brand + B.dotcom.privateBrand, 0, 100);
  } else if ((choice === 'retain' || choice === 'preserve') && !f.settled && dotcomWeek(state) >= B.dotcom.bustWeek) {
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
  y2kStep(ctx);
  if (state.era.id === 'dotcom' && state.products.some((p) => p.angle === 'web')) f.webLaunched = true;
  const end = state.eraSchedule.web2 ?? state.eraSchedule.classic;
  const week = dotcomWeek(state);
  const phase = state.week >= end ? 'recovery' : week >= B.dotcom.bustWeek ? 'bust'
    : week >= B.dotcom.warningWeek ? 'warning' : week >= B.dotcom.boomWeek ? 'boom' : 'growth';
  if (phase !== f.phase) { f.phase = phase; f.entered = state.week; }
  const seen = f.seen ??= {};
  if (phase === 'recovery') {
    // A card held by another decision cannot leave an unpaid float or erase the bust's customer loss.
    dotcomEffect(ctx, 'preserve');
    f.recovered = true;
  }
  const milestones = [
    ['dotcom_eyeballs', week >= B.dotcom.boomWeek], ['dotcom_ipo_frenzy', week >= B.dotcom.ipoWeek],
    ['dotcom_warning', week >= B.dotcom.warningWeek], ['dotcom_bust', week >= B.dotcom.bustWeek], ['dotcom_recovery', state.week >= end],
  ];
  for (const [id, due] of milestones) if (due && !seen[id]) {
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
  if (!f.recovered && week % B.dotcom.chatterEvery === 0) {
    const rng = sideRng(state.seed, 'dotcom_chat', state.week);
    emitChat(ctx, { channel: 'random', person: pick(rng, state.staff), text: pick(rng, DOTCOM_CHAT) });
  }
}
