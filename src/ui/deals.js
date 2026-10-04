// Turns one batch of sim events into what the player sees of sales: a toast for a week that is worth a beat,
// otherwise one quiet line for #wins. Reads events and state only.
import { B } from '../sim/balance.js';
import { fmtMoney, fmtNum } from './dom.js';

const sum = (list, key) => list.reduce((n, d) => n + (d[key] ?? 0), 0);
const plural = (n, word, many = `${word}s`) => `${fmtNum(n)} ${n === 1 ? word : many}`;
const firstName = (p) => p?.name?.split(' ')[0] ?? null;

// Returns { toasts: [{ text, person, productId }], quiet: [text] }. A sales-team week is toast-worthy when it is
// a product's first deal or the week's new monthly revenue reaches B.dealNotableMrr; boxed sales use their own bar.
export function dealBeats(events, state) {
  const out = { toasts: [], quiet: [] };
  const deals = events.filter((e) => e.type === 'deal');
  const product = (id) => state.products.find((p) => p.id === id);
  const sales = deals.filter((d) => !d.boxed);
  const boxes = deals.filter((d) => d.boxed);

  if (sales.length) {
    const total = sum(sales, 'mrr');
    const lead = sales.find((d) => d.first) ?? sales.reduce((a, b) => (b.mrr > a.mrr ? b : a));
    const rest = sales.length - 1;
    const seller = state.staff.find((p) => p.id === lead.sellerId) ?? null;
    if (sales.some((d) => d.first) || total >= B.dealNotableMrr) {
      const who = firstName(seller) ?? 'The sales team';
      const text = `${who} closed ${lead.customer} on ${product(lead.productId)?.name ?? 'a product'}: +${fmtMoney(lead.mrr)}/mo${rest > 0 ? `, +${rest} more (${fmtMoney(total)}/mo in all)` : ''}`;
      out.toasts.push({ text, person: seller, productId: lead.productId });
    } else {
      out.quiet.push(`Sales: ${plural(sum(sales, 'customers'), 'new customer')} this week, +${fmtMoney(total)}/mo.`);
    }
  }

  if (boxes.length) {
    const revenue = sum(boxes, 'revenue');
    const lead = boxes.find((d) => d.first) ?? boxes.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    const name = product(lead.productId)?.name ?? 'a product';
    if (boxes.some((d) => d.first) || revenue >= B.dealNotableBoxRevenue) {
      out.toasts.push({ text: `Retail moved ${plural(lead.units, 'copy', 'copies')} of ${name}: ${fmtMoney(lead.revenue)} net${boxes.length > 1 ? `, +${boxes.length - 1} more (${fmtMoney(revenue)} in all)` : ''}`, person: null, productId: lead.productId });
    } else {
      out.quiet.push(`Retail: ${plural(sum(boxes, 'units'), 'copy', 'copies')} sold this week, ${fmtMoney(revenue)} net.`);
    }
  }
  return out;
}
