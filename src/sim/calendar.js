import { B } from './balance.js';
import { dateOf, sum } from './util.js';
import { registerSystem } from './registry.js';
import { raiseDecision } from './events.js';
import { liveProducts } from './projects.js';
import { totalMrr } from './products.js';
import { emitChat } from './chat.js';

// Week-of-year calendar: SaaSCon expo (40), the Saasies awards (50), and the year in review (52).
export function annualSystem(ctx) {
  const { state } = ctx;
  const { week, year, yearIndex } = dateOf(state.week);
  if (week === 40) raiseDecision(ctx, 'conference_expo');
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
