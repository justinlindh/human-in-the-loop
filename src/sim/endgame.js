import { B } from './balance.js';
import { avg, sum } from './util.js';
import { shuffle } from './rng.js';
import { registerAction, registerSystem } from './registry.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { categoryLeaders } from './market.js';
import { EPILOGUES, GENERIC_EPILOGUES } from '../data/epilogues.js';
import { eraOnlyAllowsText, eraIndex } from './eras.js';
import { OFFICE_STAGES } from '../data/office.js';

export function scoreRun(state) {
  const mrr = totalMrr(state);
  const valuation = mrr * 12 * (4 + (8 * state.brand) / 100) + Math.max(0, state.cash);
  const wellbeing = avg(state.staff, (p) => p.meaning) * state.staff.length;
  // A company that never shipped earns nothing for brand or a happy team: there was nothing to be good at.
  const shipped = state.stats.launches > 0 ? 1 : 0;
  const breakdown = {
    valuation: valuation / 10000, brand: state.brand * 50 * shipped, wellbeing: wellbeing * 2 * shipped,
    caught: state.stats.caught * 100, breaches: -state.stats.breaches * 200, resignations: -state.stats.resignations * 50,
  };
  const raw = sum(Object.values(breakdown));
  const won = !!state.gameOver?.won;
  const funding = B.funding[state.founding?.funding]?.scoreMult ?? 1;
  const score = Math.round(Math.max(0, raw) * (won ? 1 : 0.5) * (state.flags.diluted ? 0.8 : 1) * funding);
  return { score, valuation, breakdown };
}

function summary(state, { won, reason, retiredVia }) {
  return {
    won, reason: retiredVia ?? reason, leaders: categoryLeaders(state).length, years: Math.floor(state.week / 52),
    avgMeaning: avg(state.staff, (p) => p.meaning),
    juniorsHired: state.stats.juniorsHired, caught: state.stats.caught, breaches: state.stats.breaches,
    debt: state.comprehensionDebt, resignations: state.stats.resignations,
    seniors: state.staff.filter((p) => p.seniority === 'senior').length, peakMrr: state.stats.peakMrr,
    ...story(state),
  };
}

// What the run was, for the lines that retell it: where the company ended up, what it lived through,
// what it shipped, and who was there.
function story(state) {
  const stage = OFFICE_STAGES[state.officeStage];
  const expansion = stage.expansions?.[(state.office.expansion ?? 0) - 1];
  const veteran = state.staff.filter((p) => !p.founder).sort((a, b) => a.hiredWeek - b.hiredWeek)[0] ?? null;
  return {
    officeStage: state.officeStage,
    office: expansion ? `an HQ with ${expansion.name === 'The Annex' ? 'an annex' : `a ${expansion.name.toLowerCase()}`}` : stage.name === 'HQ Building' ? 'its own HQ' : `the ${stage.name}`,
    eraCount: eraIndex(state) + 1,
    launches: state.stats.launches,
    people: state.stats.hires + state.staff.filter((p) => p.founder).length,
    alumni: state.flags.alumni?.length ?? 0,
    veteran: veteran ? veteran.name : null,
    veteranYears: veteran ? Math.floor((state.week - veteran.hiredWeek) / 52) : 0,
  };
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
const fill = (state, text, x = {}) => text.replaceAll('{company}', state.companyName).replaceAll('{acquirer}', state.flags.acquirer ?? 'a much bigger company')
  .replaceAll('{office}', x.office ?? 'the garage').replaceAll('{launches}', String(x.launches ?? 0))
  .replaceAll('{eras}', `${NUMBER_WORDS[x.eraCount] ?? x.eraCount} ${x.eraCount === 1 ? 'era' : 'eras'}`)
  .replaceAll('{people}', String(x.people ?? 0)).replaceAll('{alumni}', String(x.alumni ?? 0))
  .replaceAll('{veteran}', x.veteran ?? 'Someone').replaceAll('{veteranYears}', String(x.veteranYears ?? 0));

// Every matching epilogue in list order (outcome lines come first), capped at 5, topped up to 3 with generic lines.
export function buildEpilogue(state, outcome) {
  const x = summary(state, outcome);
  const lines = EPILOGUES.filter((e) => e.when(state, x) && eraOnlyAllowsText(state, e.text)).slice(0, 5).map((e) => fill(state, e.text, x));
  for (const g of shuffle(state.rng, GENERIC_EPILOGUES.filter((e) => e.when(state, x) && eraOnlyAllowsText(state, e.text)))) {
    if (lines.length >= 3) break;
    lines.push(fill(state, g.text, x));
  }
  return lines;
}

export function endGame(ctx, { won, reason, retiredVia = null }) {
  const { state } = ctx;
  if (state.gameOver) return;
  state.gameOver = { won, reason, score: 0, epilogue: [] };
  if (retiredVia) state.gameOver.retiredVia = retiredVia;
  state.gameOver.score = scoreRun(state).score;
  state.gameOver.epilogue = buildEpilogue(state, { won, reason, retiredVia });
  ctx.emit({ type: 'gameOver' });
}

function collapsed(state) {
  const o = state.outage;
  if (!o) return false;
  const mrr = totalMrr(state);
  const product = state.products.find((p) => p.id === o.productId);
  const share = mrr > 0 ? (product?.mrr ?? 0) / mrr : 1;
  // An unfixable outage collapses the lab if it hits the main product, or if nobody understands the systems anymore.
  return o.unrecoverable && o.weeks >= B.outageCollapseWeeks
    && (share >= B.collapseMrrShare || state.institutionalKnowledge < B.collapseIkBelow);
}

export function endgameSystem(ctx) {
  const { state } = ctx;
  if (state.lowCashWeeks >= B.runwayLoseWeeks) return endGame(ctx, { won: false, reason: 'runway' });
  if (collapsed(state)) return endGame(ctx, { won: false, reason: 'collapse' });
  // The 20th anniversary is the natural end of a career: epilogue and score, then the player may keep playing.
  if (state.week >= B.anniversaryWeek - 1 && state.flags.anniversaryWeek === undefined) {
    state.flags.anniversaryWeek = state.week;
    endGame(ctx, { won: true, reason: 'anniversary' });
  }
}

registerAction('keepPlaying', (ctx) => {
  const { state } = ctx;
  if (state.gameOver?.reason !== 'anniversary') return { ok: false, reason: 'Only after the 20th anniversary' };
  state.flags.anniversaryScore = state.gameOver.score;
  state.gameOver = null;
  ctx.emit({ type: 'toast', text: `${state.companyName} keeps going. The anniversary cake is still in the fridge.`, tone: 'good' });
  return { ok: true };
});

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

// Why an IPO is not available yet, or null when it is.
export function ipoBlocker(state) {
  if (state.week < B.retireFromWeek) return 'Opens in year 10';
  if (totalMrr(state) < B.ipoMrr) return `Needs $${B.ipoMrr.toLocaleString('en-US')} MRR`;
  if (state.brand < B.ipoBrand) return `Needs brand ${B.ipoBrand}`;
  if (state.officeStage < 2) return 'Needs the HQ Building';
  return null;
}

export const acquisitionOpen = (state) => (state.flags.acquisitionOfferUntil ?? -1) >= state.week;

// How the player can retire right now: 'ipo', 'acquired', or null.
export const retireVia = (state) => (!ipoBlocker(state) ? 'ipo' : acquisitionOpen(state) ? 'acquired' : null);

// Both ways to retire, each with whether it is open now and why not; the UI's Retire flow reads this.
export function retireOptions(state) {
  const ipo = ipoBlocker(state);
  const open = acquisitionOpen(state);
  return {
    ipo: { ok: !ipo, reason: ipo },
    acquired: { ok: open, reason: open ? null : 'No acquisition offer on the table', by: open ? state.flags.acquisitionOfferFrom ?? null : null },
  };
}

export function retire(ctx, via) {
  const { state } = ctx;
  if (via === 'acquired') state.flags.acquirer ??= state.flags.acquisitionOfferFrom ?? 'a much bigger company';
  endGame(ctx, { won: true, reason: 'retired', retiredVia: via });
}

registerAction('retire', (ctx) => {
  const via = retireVia(ctx.state);
  if (!via) return { ok: false, reason: 'Needs an IPO or an open acquisition offer' };
  retire(ctx, via);
  return { ok: true };
});

registerAction('ipo', (ctx) => {
  const reason = ipoBlocker(ctx.state);
  if (reason) return { ok: false, reason };
  retire(ctx, 'ipo');
  return { ok: true };
});
