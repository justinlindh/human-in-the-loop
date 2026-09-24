import { B } from './balance.js';
import { clamp } from './util.js';
import { registerSystem } from './registry.js';
import { raiseDecision } from './events.js';
import { eraAtLeast } from './eras.js';

// How far Purpose sits from neutral, -1..1 (0 when there is no mission yet).
export const purposeLift = (state) => (state.purpose ? clamp((state.purpose.value - 50) / 50, -1, 1) : 0);

export function setMission(state, mission) {
  state.purpose = { value: B.purposeStart[mission] ?? 50, mission, tests: [] };
}

// Moves Purpose by the delta the decision gives this mission (or `default`), and records the test.
export function testPurpose(state, deltas, text) {
  const p = state.purpose;
  if (!p) return;
  const delta = deltas[p.mission] ?? deltas.default ?? 0;
  if (!delta) return;
  p.value = clamp(p.value + delta, 0, 100);
  p.tests.push({ week: state.week, text, delta });
  if (p.tests.length > B.purposeTestsKept) p.tests.splice(0, p.tests.length - B.purposeTestsKept);
}

// The mission decision arrives a couple of months into the Agents era.
export function purposeSystem(ctx) {
  const { state } = ctx;
  if (state.purpose || state.flags.missionAsked !== undefined || !eraAtLeast(state, 'agents')) return;
  if (state.week < state.era.since + B.missionAfterWeeks && state.era.id === 'agents') return;
  state.flags.missionAsked = state.week;
  raiseDecision(ctx, 'mission_statement', null, { queue: true });
}

registerSystem('purpose', purposeSystem, 13);
