import { B } from './balance.js';
import { clamp, sum } from './util.js';
import { registerSystem } from './registry.js';
import { ROLES } from '../data/roles.js';
import { itemBonus, researchBonus } from './bonus.js';
import { staffMods } from './staff.js';

const LEARNING = new Set(['project', 'maintenance', 'oversight', 'hardProblem', 'security']);

// Called whenever someone leaves (fired, resigned, event). The person must already be removed from staff.
export function onDeparture(state, person) {
  state.comprehensionDebt = Math.min(100, state.comprehensionDebt
    + person.knowledge * B.debtFromDeparturePerKnowledge * Math.max(0, 1 + researchBonus(state, 'departureDebt')));
  for (const p of state.staff) {
    if (p.assignment.targetId === person.id && p.assignment.type === 'mentor') {
      p.assignment = { type: ROLES[p.role].defaultAssignment, targetId: null };
    }
  }
  for (const pr of state.products) if (pr.ownerId === person.id) pr.ownerId = null;
}

export function institutionalKnowledge(state) {
  const live = state.products.filter((p) => !p.killed).length;
  const holders = state.staff.filter((p) => p.role === 'engineer' || p.role === 'security');
  const held = sum(holders, (p) => (p.knowledge / 100) * B.seniorityOutput[p.seniority]);
  const standup = state.policies.daily_standups ? B.standupIkBonus : state.policies.async_standups ? B.standupIkBonus / 2 : 0;
  return clamp(((100 * held) / (B.ikBaseline + B.ikPerProduct * live)) * (1 + researchBonus(state, 'ik') + standup), 0, 100);
}

export function knowledgeSystem(ctx) {
  const { state } = ctx;
  const engLevel = state.automation.engineering.level;
  const mentees = new Set(state.staff.filter((p) => p.mood !== 'away' && p.assignment.type === 'mentor').map((p) => p.assignment.targetId));

  for (const p of state.staff) {
    if (p.mood === 'away') continue;
    const a = p.assignment.type;
    let gain = 0;
    if (LEARNING.has(a)) {
      const dulled = p.role === 'engineer' && a !== 'hardProblem';
      gain += B.knowledgeGainWorking * (dulled ? 1 - 0.7 * engLevel : 1);
    }
    if (p.seniority === 'junior' && mentees.has(p.id)) gain += B.knowledgeGainMentee;
    p.knowledge = Math.min(100, p.knowledge + gain * staffMods(p).knowledgeGain * (1 + itemBonus(state, 'knowledgeGain')));
  }

  state.institutionalKnowledge = institutionalKnowledge(state);

  const live = state.products.filter((p) => !p.killed).length;
  const { engineering, qa, ops } = state.automation;
  const ik = state.institutionalKnowledge;
  const seniorEngs = state.staff.filter((p) => p.role === 'engineer' && p.seniority === 'senior' && p.mood !== 'away');
  const delta = B.debtFromEngAuto * engineering.level * (state.projects.length > 0 ? 1 : 0.5)
    + B.debtFromQaAuto * qa.level
    + B.debtFromOpsAuto * ops.level
    + B.debtPerProduct * live
    + (ik < B.debtLowIkThreshold ? (B.debtLowIkThreshold - ik) * B.debtLowIkRate : 0)
    - B.debtPaydownPerSeniorEng * sum(seniorEngs, (p) => (p.knowledge / 100) * staffMods(p).debtPaydown)
    - (state.policies.comprehension_reviews ? B.debtPaydownReviews : 0);
  state.comprehensionDebt = clamp(state.comprehensionDebt + delta, 0, 100);
}

registerSystem('knowledge', knowledgeSystem, 55);
