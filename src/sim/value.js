import { B } from './balance.js';

// Effects that make a structural or identity call: automation and models, policies, the NOC, pivots and
// product or market switches, people joining or leaving, exits, era bets, the mission and the moonshot.
export const STRUCTURAL_KEYS = ['setAutomation', 'automationBump', 'migrateOff', 'modelBoost', 'agentCap', 'workPolicy',
  'efficiencyCuts', 'nocMode', 'pivot', 'rivalMerge', 'acquireBest', 'expandNow', 'preinternet', 'dotcom',
  'resign', 'candidates', 'aiInterview', 'win', 'openOffer', 'mission', 'purpose', 'moonshot', 'lastBet'];
// Story flags that give away part of the company; other flags only remember what happened.
export const EQUITY_FLAGS = ['diluted', 'incubatorCut'];

// Whether effects make a structural call, or commit to a modifier over B.askRates.structuralWeeks or a
// cash swing over B.askRates.structuralCashShare of the cash in hand.
export function structural(s, fx, depth = 0) {
  if (!fx || depth > 3) return false;
  if (STRUCTURAL_KEYS.some((k) => fx[k] !== undefined && fx[k] !== null && fx[k] !== false)) return true;
  if (EQUITY_FLAGS.includes(fx.flag?.name)) return true;
  if (fx.cash && Math.abs(fx.cash) > Math.max(0, s.cash) * B.askRates.structuralCashShare) return true;
  if ([fx.modifier].flat().some((m) => m && m.weeks > B.askRates.structuralWeeks)) return true;
  const nested = [fx.cond?.then, fx.cond?.else, fx.gamble?.effects, fx.gamble?.else, ...(fx.later ?? []).map((l) => l.effects)];
  return nested.some((n) => structural(s, n, depth + 1));
}

// Rough value of an effects object for a careful player.
export function sensibleValue(s, fx, depth = 0) {
  if (!fx || depth > 3) return 0;
  let v = 0;
  v += (fx.cash ?? 0) / Math.max(20000, s.cash * 0.15);
  // A careful player never spends money they do not have.
  if (fx.cash < 0 && s.cash + fx.cash < 0) v -= 20;
  v += (fx.brand ?? 0) * 0.8 + (fx.teamMeaning ?? 0) * 0.6 + (fx.meaning ?? 0) * 0.15 + (fx.ik ?? 0) * 0.3;
  v -= (fx.debt ?? 0) * 0.3;
  v += (fx.customersPct ?? 0) * 0.3 + (fx.hype ?? 0) * 0.05;
  if (fx.resign) v -= 6;
  if (fx.assign?.type === 'mentor') v += 3;
  if (fx.assign?.type === 'hardProblem') v += s.staff.length >= 6 ? 3 : -3;
  if (fx.setAutomation || fx.automationBump > 0) v -= 3;
  if (fx.automationBump < 0) v += 1;
  if (fx.salaryPct) v -= fx.salaryPct * 0.05;
  if (fx.teamSalaryPct) v -= fx.teamSalaryPct * 0.1;
  if (fx.consultants) v += 5;
  if (fx.clearOutage) v += 4;
  if (fx.postmortem) v += B.postmortemDebt * 0.3 + B.postmortemKnowledge * 0.1 - (s.policies.blameless ? 0 : B.postmortemMeaning * 0.15);
  if (fx.pivot) v -= 2;
  if (fx.cond) v += 0.5 * (sensibleValue(s, fx.cond.then, depth + 1) + sensibleValue(s, fx.cond.else, depth + 1));
  if (fx.gamble) v += fx.gamble.p * sensibleValue(s, fx.gamble.effects, depth + 1) + (1 - fx.gamble.p) * sensibleValue(s, fx.gamble.else, depth + 1);
  for (const l of fx.later ?? []) v += 0.8 * sensibleValue(s, l.effects, depth + 1);
  for (const m of [fx.modifier].flat().filter(Boolean)) {
    const good = ['output', 'meaningRecovery', 'hype', 'brandPerWeek', 'acquisition', 'xp', 'oversight'].includes(m.key);
    v += (good ? 1 : -1) * m.value * Math.min(m.weeks, 26) * 0.15;
  }
  if (fx.win === 'acquired') v -= 100;
  return v;
}
