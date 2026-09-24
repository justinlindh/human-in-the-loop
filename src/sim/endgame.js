import { B } from './balance.js';
import { avg, sum } from './util.js';
import { shuffle } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { categoryLeaders } from './market.js';
import { EPILOGUES, GENERIC_EPILOGUES } from '../data/epilogues.js';

export function scoreRun(state) {
  const mrr = totalMrr(state);
  const valuation = mrr * 12 * (4 + (8 * state.brand) / 100) + Math.max(0, state.cash);
  const wellbeing = avg(state.staff, (p) => p.meaning) * state.staff.length;
  const breakdown = {
    valuation: valuation / 10000, brand: state.brand * 50, wellbeing: wellbeing * 2,
    caught: state.stats.caught * 100, breaches: -state.stats.breaches * 200, resignations: -state.stats.resignations * 50,
  };
  const raw = sum(Object.values(breakdown));
  const won = !!state.gameOver?.won;
  const score = Math.round(Math.max(0, raw) * (won ? 1 : 0.5) * (state.flags.diluted ? 0.8 : 1));
  return { score, valuation, breakdown };
}

function summary(state, { won, reason }) {
  return {
    won, reason,
    avgMeaning: avg(state.staff, (p) => p.meaning),
    juniorsHired: state.stats.juniorsHired, caught: state.stats.caught, breaches: state.stats.breaches,
    debt: state.comprehensionDebt, resignations: state.stats.resignations,
    seniors: state.staff.filter((p) => p.seniority === 'senior').length, peakMrr: state.stats.peakMrr,
  };
}

const fill = (state, text) => text.replaceAll('{company}', state.companyName).replaceAll('{acquirer}', state.flags.acquirer ?? 'a much bigger company');

// Every matching epilogue in list order (outcome lines come first), capped at 5, topped up to 3 with generic lines.
export function buildEpilogue(state, outcome) {
  const x = summary(state, outcome);
  const lines = EPILOGUES.filter((e) => e.when(state, x)).slice(0, 5).map((e) => fill(state, e.text));
  for (const g of shuffle(state.rng, GENERIC_EPILOGUES)) {
    if (lines.length >= 3) break;
    lines.push(fill(state, g.text));
  }
  return lines;
}

export function endGame(ctx, { won, reason }) {
  const { state } = ctx;
  if (state.gameOver) return;
  state.gameOver = { won, reason, score: 0, epilogue: [] };
  state.gameOver.score = scoreRun(state).score;
  state.gameOver.epilogue = buildEpilogue(state, { won, reason });
  ctx.emit({ type: 'gameOver' });
}

function collapsed(state) {
  const o = state.outage;
  if (!o) return false;
  const mrr = totalMrr(state);
  const product = state.products.find((p) => p.id === o.productId);
  const share = mrr > 0 ? (product?.mrr ?? 0) / mrr : 1;
  if (o.unrecoverable && o.weeks >= B.outageCollapseWeeks && share >= B.collapseMrrShare) return true;
  return !state.staff.some((p) => !p.founder) && state.institutionalKnowledge < 10;
}

export function endgameSystem(ctx) {
  const { state } = ctx;
  if (state.lowCashWeeks >= B.runwayLoseWeeks) return endGame(ctx, { won: false, reason: 'runway' });
  if (collapsed(state)) return endGame(ctx, { won: false, reason: 'collapse' });
  if (state.week >= B.runWeeks - 1) {
    const won = categoryLeaders(state).length >= B.leaderCategoriesToWin;
    endGame(ctx, { won, reason: won ? 'leader' : 'timeout' });
  }
}

export function historySystem(ctx) {
  const { state } = ctx;
  const count = (s) => state.staff.filter((p) => p.seniority === s).length;
  state.history.push({
    week: state.week, cash: state.cash, mrr: totalMrr(state), customers: sum(liveProducts(state), (p) => p.customers),
    brand: state.brand, debt: state.comprehensionDebt, ik: state.institutionalKnowledge,
    juniors: count('junior'), mids: count('mid'), seniors: count('senior'),
    avgMeaning: avg(state.staff, (p) => p.meaning), incidents: state.stats.incidents,
  });
  if (state.history.length > B.maxHistory) state.history.splice(0, state.history.length - B.maxHistory);
}

registerSystem('endgame', endgameSystem, 90);
registerSystem('history', historySystem, 95);

registerAction('ipo', (ctx) => {
  const { state } = ctx;
  if (totalMrr(state) < B.ipoMrr) return { ok: false, reason: `Needs $${B.ipoMrr.toLocaleString('en-US')} MRR` };
  if (state.brand < B.ipoBrand) return { ok: false, reason: `Needs brand ${B.ipoBrand}` };
  if (state.officeStage !== 2) return { ok: false, reason: 'Needs the HQ Building' };
  endGame(ctx, { won: true, reason: 'ipo' });
  return { ok: true };
});
