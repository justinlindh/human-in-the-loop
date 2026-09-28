import { clamp } from './util.js';

// A one-off change to comprehension debt (a departure, a choice, the Big Refactor). The debt is clamped to
// 0..100 here, and the amount asked for is added to this week's debtFlow.oneOff, clamped or not.
export function bumpDebt(state, amount) {
  if (!amount) return;
  state.comprehensionDebt = clamp(state.comprehensionDebt + amount, 0, 100);
  state.flags.debtOneOff = (state.flags.debtOneOff ?? 0) + amount;
}
