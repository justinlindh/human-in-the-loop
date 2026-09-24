import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { raiseDecision } from './events.js';
import { eraAtLeast } from './eras.js';
import { nextExpansion } from './office.js';
import { officeGateReason } from './products.js';

// Mid-era beats: one-time decisions that fill the long stretches between eras. Each fires once, at a set
// number of weeks into its era, when its conditions hold.
const BEATS = [
  { id: 'agent_bill', ready: (s, since) => eraAtLeast(s, 'agents') && s.week >= since.agents + B.beatAgentBillAfter },
  { id: 'rival_megaround', ready: (s, since) => eraAtLeast(s, 'agents') && s.week >= since.agents + B.beatMegaroundAfter
    && (s.rival?.status === 'rising' || s.rival?.status === 'stalled') },
  { id: 'floor_next_door', ready: (s, since) => eraAtLeast(s, 'agents') && s.week >= since.agents + B.beatFloorNextDoorAfter
    && nextExpansion(s)?.step === 1 && !officeGateReason(s, nextExpansion(s)) && s.cash >= nextExpansion(s).upgradeCost },
  { id: 'deals_open', ready: (s) => eraAtLeast(s, 'consolidation') && (s.market.forSale ?? []).length > 0 },
];

export function beatsSystem(ctx) {
  const { state } = ctx;
  const done = (state.flags.beats ??= {});
  for (const beat of BEATS) {
    if (done[beat.id] !== undefined || !beat.ready(state, state.eraSchedule)) continue;
    done[beat.id] = state.week;
    raiseDecision(ctx, beat.id, null, { queue: true });
  }
}

registerSystem('beats', beatsSystem, 14);
