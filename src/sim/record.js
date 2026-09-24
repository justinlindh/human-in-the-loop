import { B } from './balance.js';

// Lifetime counters per person, in whole units. Work arrives in fractions each week, so the leftover
// fraction is carried in state.flags.recordCarry until it adds up to a whole one.
export const emptyRecord = () => ({
  mentorWeeks: 0, catches: 0, hardProblemWeeks: 0,
  launches: 0, features: 0, prsMerged: 0, salesMrr: 0, deals: 0, tickets: 0, incidentsCaught: 0, mentored: 0,
});

// Fills any counter a record is missing, so older staff and saves keep working.
export function ensureRecord(p) {
  const full = emptyRecord();
  p.record ??= full;
  for (const k of Object.keys(full)) p.record[k] ??= 0;
  return p.record;
}

export function addToRecord(state, p, key, amount) {
  if (!(amount > 0)) return;
  const rec = ensureRecord(p);
  const carry = ((state.flags.recordCarry ??= {})[p.id] ??= {});
  const total = (carry[key] ?? 0) + amount;
  const whole = Math.floor(total);
  rec[key] += whole;
  carry[key] = total - whole;
}

// A week of project work: engineers and designers turn their points into features, and engineers'
// feature and reliability work into merged PRs.
export function recordProjectWork(state, p, pts) {
  if (p.role === 'engineer') {
    addToRecord(state, p, 'features', pts.features / B.recordEngPointsPerFeature);
    addToRecord(state, p, 'prsMerged', (pts.features + pts.reliability) / B.recordPointsPerPr);
  } else if (p.role === 'designer') {
    addToRecord(state, p, 'features', (pts.polish + pts.features) / B.recordDesignPointsPerFeature);
  }
}

// A week of maintenance: fixes land as merged PRs too.
export function recordMaintenance(state, p, pts) {
  if (p.role === 'engineer') addToRecord(state, p, 'prsMerged', (pts.features + pts.reliability) / B.recordPointsPerPr);
}

// Drops a departed person's carried fractions.
export function forgetCarry(state, id) {
  if (state.flags.recordCarry) delete state.flags.recordCarry[id];
}
