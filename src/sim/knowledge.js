import { B } from './balance.js';
import { ROLES } from '../data/roles.js';

// Called whenever someone leaves (fired, resigned, event). The person must already be removed from staff.
export function onDeparture(state, person) {
  state.comprehensionDebt = Math.min(100, state.comprehensionDebt + person.knowledge * B.debtFromDeparturePerKnowledge);
  for (const p of state.staff) {
    if (p.assignment.targetId === person.id && p.assignment.type === 'mentor') {
      p.assignment = { type: ROLES[p.role].defaultAssignment, targetId: null };
    }
  }
  for (const pr of state.products) if (pr.ownerId === person.id) pr.ownerId = null;
}
