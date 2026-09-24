import { B } from './balance.js';
import { dateOf, sum, avg } from './util.js';
import { registerSystem } from './registry.js';
import { raiseDecision } from './events.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { emitChat } from './chat.js';
import { eraAtLeast } from './eras.js';
import { ANGLES } from '../data/angles.js';

// The newer Saasies: Best AI Feature (from the ChatGBT moment), Best Place to Work, and Most Trusted
// (from Consolidation). Each is judged on this year, and each pays out in its own currency: hype for the
// product, pride for the team, brand for trust.
function otherAwards(ctx) {
  const { state } = ctx;
  const since = state.flags.yearStart ?? { resignations: 0, breaches: 0, incidents: 0 };
  const win = (title, detail) => {
    state.stats.awards++;
    ctx.emit({ type: 'award', text: `${title}: ${detail}` });
    emitChat(ctx, { channel: 'wins', from: '@saasies', text: `And the Saasie for ${title} goes to... ${detail}!` });
  };
  if (eraAtLeast(state, 'chatgbt')) {
    const ai = liveProducts(state).filter((p) => ANGLES[p.angle]?.ai && p.score >= B.awardAiScore).sort((a, b) => b.score - a.score)[0];
    if (ai) { win('Best AI Feature', ai.name); ai.hype = Math.min(100, ai.hype + B.awardAiHype); }
  }
  // Best Place to Work: a big team, everyone in good spirits, high meaning, and nobody quit this year.
  const team = state.staff.filter((p) => p.mood !== 'away');
  if (team.length >= B.awardWorkplaceStaff && team.every((p) => p.mood === 'ok' && (p.strain ?? 0) < B.strainWarn)
    && avg(team, (p) => p.meaning) >= B.awardWorkplaceMeaning && state.stats.resignations === since.resignations) {
    // The judges spread it around: after awardWorkplaceStreak wins in a row, someone else gets a turn.
    const streak = state.flags.workplaceStreak ?? 0;
    if (streak >= B.awardWorkplaceStreak) {
      state.flags.workplaceStreak = 0;
      emitChat(ctx, { channel: 'wins', from: '@saasies', text: `Best Place to Work goes to someone else this year. The judges say ${state.companyName} "has enough trophies".` });
    } else {
      state.flags.workplaceStreak = streak + 1;
      win('Best Place to Work', state.companyName);
      for (const p of state.staff) p.meaning = Math.min(100, p.meaning + B.awardWorkplacePride);
    }
  } else {
    state.flags.workplaceStreak = 0;
  }
  if (eraAtLeast(state, 'consolidation') && liveProducts(state).length && state.stats.breaches === since.breaches
    && state.stats.incidents - since.incidents <= B.awardTrustedIncidents) {
    win('Most Trusted', state.companyName);
    state.brand = Math.min(100, state.brand + B.awardTrustedBrand);
  }
}

const SUMMITS = ['ai_summit', 'ai_summit_panel', 'ai_summit_hackathon'];

// The AI Summit rotates its three formats. After summitPauseAfter declines in a row the invitations stop
// until the company launches a new AI product.
function summit(ctx) {
  const { state } = ctx;
  if ((state.flags.summitDeclines ?? 0) >= B.summitPauseAfter) {
    const shipped = state.products.some((p) => ANGLES[p.angle]?.ai && p.launchedWeek > state.flags.summitSkipWeek);
    if (!shipped) return;
    state.flags.summitDeclines = 0;
  }
  const n = state.flags.summitCount ?? 0;
  state.flags.summitCount = n + 1;
  raiseDecision(ctx, SUMMITS[n % SUMMITS.length], null, { queue: true });
}

// Week-of-year calendar: SaaSCon expo (40), the Saasies awards (50), and the year in review (52).
export function annualSystem(ctx) {
  const { state } = ctx;
  const { week, year, yearIndex } = dateOf(state.week);
  if (week === 1) state.flags.yearStart = { resignations: state.stats.resignations, breaches: state.stats.breaches, incidents: state.stats.incidents };
  if (week === 40) raiseDecision(ctx, 'conference_expo', null, { queue: true });
  if (week === B.aiSummitWeek && eraAtLeast(state, 'chatgbt')) summit(ctx);
  // The hearing: once, when regulators start looking at AI companies.
  if (state.flags.hearingWeek === undefined && state.week >= B.hearingFromWeek && eraAtLeast(state, 'agents')
    && liveProducts(state).filter((p) => ANGLES[p.angle]?.ai).length >= 2) {
    state.flags.hearingWeek = state.week;
    raiseDecision(ctx, 'hearing_summons', null, { queue: true });
  }
  if (week === 50) {
    const best = liveProducts(state).filter((p) => p.score >= 8).sort((a, b) => b.score - a.score || b.mrr - a.mrr)[0];
    if (best) {
      state.brand = Math.min(100, state.brand + 6);
      for (const p of state.staff) if (p.role === 'engineer' || p.role === 'designer') p.meaning = Math.min(100, p.meaning + B.meaningAwardBonus);
      state.stats.awards++;
      ctx.emit({ type: 'award', text: `Product of the Year: ${best.name}` });
      ctx.emit({ type: 'celebrate', staffId: null });
      emitChat(ctx, { channel: 'wins', from: '@saasies', text: `And the Saasie for Product of the Year goes to... ${best.name}!` });
    }
    otherAwards(ctx);
    if (state.flags.worstOutageYear === yearIndex) {
      ctx.emit({ type: 'award', text: `Worst Outage: ${state.flags.worstOutageProduct ?? 'your product'}. The trophy is a melted server.` });
    }
  }
  if (week === 52) {
    const customers = sum(liveProducts(state), (p) => p.customers);
    ctx.emit({
      type: 'toast', tone: 'info',
      text: `${year} in review: MRR $${Math.round(totalMrr(state)).toLocaleString('en-US')}, ${customers.toLocaleString('en-US')} customers, ${state.staff.length} people.`,
    });
  }
}

registerSystem('annual', annualSystem, 75);
