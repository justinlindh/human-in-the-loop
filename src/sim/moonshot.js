import { B } from './balance.js';
import { registerSystem } from './registry.js';
import { chance, pick } from './rng.js';
import { newId, clamp } from './util.js';
import { raiseDecision } from './events.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { moonshotWeekly } from './economy.js';
import { testPurpose } from './purpose.js';
import { emitChat } from './chat.js';
import { CATEGORIES } from '../data/categories.js';
import { MOONSHOT_NAMES } from '../data/forsale.js';

const addFame = (state, n) => { state.fame = clamp((state.fame ?? 0) + n, 0, 100); };

// The moonshot lab: 'start' funds it at this week's rate; 'continue' and 'stop' answer a check-in;
// 'resolve' opens it after the last check-in.
export function moonshotEffect(ctx, step) {
  const { state, rng } = ctx;
  const m = state.flags.moonshot;
  if (step === 'start') {
    state.flags.moonshot = { name: MOONSHOT_NAMES[state.seed % MOONSHOT_NAMES.length], active: true, since: state.week, weekly: moonshotWeekly(state), checkins: 0, outcome: null };
  } else if (!m) {
    return;
  } else if (step === 'continue') {
    m.checkins++;
  } else if (step === 'stop') {
    Object.assign(m, { active: false, outcome: 'stopped' });
    state.flags.moonshotDone = true;
    addFame(state, B.moonshotStopFame);
  } else if (step === 'resolve') {
    m.active = false;
    // The curtain comes down either way.
    state.flags.moonshotDone = true;
    if (chance(rng, B.moonshotSuccess)) {
      m.outcome = 'shipped';
      launchMoonshot(ctx, m);
    } else {
      m.outcome = 'failed';
      addFame(state, B.moonshotFailFame);
      state.brand = clamp(state.brand - B.moonshotFailBrand, 0, 100);
      ctx.emit({ type: 'toast', tone: 'warn', text: `Project ${m.name} did not work. The post-mortem is the best document anyone here has ever written.` });
      emitChat(ctx, { channel: 'random', from: '@newsbot', text: `"${state.companyName}'s moonshot was a glorious failure," says a blog that loves glorious failures.` });
    }
  }
}

// A moonshot that works becomes a product in a market the company is not in yet, if there is one.
function launchMoonshot(ctx, m) {
  const { state, rng } = ctx;
  const mine = new Set(liveProducts(state).map((p) => p.category));
  const fresh = state.market.unlockedCategories.filter((c) => !mine.has(c));
  const category = pick(rng, fresh.length ? fresh : state.market.unlockedCategories);
  const mrr = Math.max(B.moonshotMinMrr, totalMrr(state) * B.moonshotCustomers);
  const customers = Math.round(mrr / CATEGORIES[category].price);
  state.products.push({
    id: newId(state, 'p'), name: m.name, category, angle: 'web', model: null, modelVersion: 0, version: 1, size: 'large',
    stats: { ...B.moonshotProduct.stats }, score: B.moonshotProduct.score, reviews: [],
    customers, mrr: customers * CATEGORIES[category].price, hype: B.moonshotProduct.hype, novelty: B.moonshotProduct.novelty,
    health: B.moonshotProduct.health, baseHealth: B.moonshotProduct.health, uptime: 1,
    launchedWeek: state.week, copyAtWeek: state.week + B.copyDelayWeeks[1], copied: false, wrapperHit: false, ownerId: null, migrationDueWeek: null, killed: false,
  });
  state.stats.launches++;
  addFame(state, B.moonshotWinFame);
  state.brand = clamp(state.brand + B.moonshotWinBrand, 0, 100);
  ctx.emit({ type: 'launch', productId: state.products.at(-1).id });
  ctx.emit({ type: 'celebrate', staffId: null });
  ctx.emit({ type: 'toast', tone: 'good', text: `Project ${m.name} works. It is a whole new product, and the internet has opinions. Good ones.` });
}

// The founders' last big bet: one more moonshot, a foundation, or handing over the keys.
export function lastBetEffect(ctx, bet) {
  const { state, rng } = ctx;
  if (bet === 'moonshot') {
    state.cash -= Math.max(0, state.cash) * B.lastBetCashShare;
    const won = chance(rng, B.lastBetSuccess);
    state.flags.lastBet = won ? 'moonshot_won' : 'moonshot_lost';
    addFame(state, won ? B.lastBetWinFame : B.lastBetLoseFame);
    state.brand = clamp(state.brand + (won ? B.lastBetWinBrand : -B.lastBetLoseBrand), 0, 100);
    ctx.emit({ type: 'toast', tone: won ? 'good' : 'warn', text: won ? 'The founders\' last bet pays off. People will be telling this story for years.' : 'The founders\' last bet does not land. They seem oddly at peace with it.' });
  } else if (bet === 'foundation') {
    state.cash -= Math.max(0, state.cash) * B.foundationCashShare;
    state.flags.lastBet = 'foundation';
    addFame(state, B.foundationFame);
    testPurpose(state, B.foundationPurpose, 'The foundation');
    for (const p of state.staff) p.meaning = Math.min(100, p.meaning + B.foundationMeaning);
  } else if (bet === 'keys') {
    state.flags.lastBet = 'keys';
    for (const p of state.staff) if (!p.founder && p.seniority === 'senior') p.meaning = Math.min(100, p.meaning + B.keysSeniorMeaning);
  }
}

// Check-ins every moonshotCheckinWeeks while the lab is funded; the unveiling after the last one.
export function moonshotSystem(ctx) {
  const { state } = ctx;
  const m = state.flags.moonshot;
  if (!m?.active) return;
  const due = m.since + (m.checkins + 1) * B.moonshotCheckinWeeks;
  if (state.week < due || m.raisedFor === due) return;
  m.raisedFor = due;
  raiseDecision(ctx, m.checkins + 1 >= B.moonshotCheckins ? 'moonshot_result' : 'moonshot_checkin', null, { queue: true });
}

registerSystem('moonshot', moonshotSystem, 15);
