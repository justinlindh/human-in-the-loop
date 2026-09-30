import { h, setText, fmtMoney, fmtNum } from '../dom.js';
import { B } from '../../sim/balance.js';
import { batchQuote, patchQuote } from '../../sim/boxed.js';
import { liveView } from '../widgets.js';

export const hasInventory = (s) => s.founding?.startEra === 'preinternet' || s.products.some((p) => p.boxed);

export function inventoryView(ctx) {
  return liveView(
    (s) => s.products.filter((p) => p.boxed).map((p) => `${p.id}:${p.killed}`).join(),
    (s, bind) => {
      const products = s.products.filter((p) => p.boxed);
      const intro = h('details.card.inventory-help', null,
        h('summary', { text: 'How batches, returns and patches work' }),
        h('p.small', { text: `Launch a Boxed Software product, order a batch, then wait ${B.preinternet.leadWeeks} playable weeks. Copies sell for ${fmtMoney(B.preinternet.price)}; the retailer keeps ${B.preinternet.retailerShare * 100}%. Each copy costs ${fmtMoney(B.preinternet.unitCost)} to duplicate before item discounts.` }),
        h('p.small', { text: `Reviews below ${B.preinternet.returnScore} bring ${B.preinternet.returnRate * 100}% customer returns. ${B.preinternet.buybackDelayWeeks} weeks after the first delivery, the retailer withdraws unsold stock and charges ${B.preinternet.buybackShare * 100}% of its manufacturing cost, up to ${fmtMoney(B.preinternet.buybackCap)}.` }),
        h('p.small', { text: `Maintenance slows wear. Mail a patch to restore installed copies: ${fmtMoney(B.preinternet.patchPerCustomer)} each, capped at ${fmtMoney(B.preinternet.patchCap)}. Updates improve the release; mailing distributes the patch.` }),
        h('p.small', { text: 'Box sales are one-time cash. Installed copies never become subscribers. Start a separate On-prem or web product to sell recurring service contracts.' }));
      if (!products.length) return [intro, h('div.empty', { text: 'No physical releases yet. Pick Boxed Software in Build, then return here to order the first batch.' }),
        h('button.btn.blue', { onclick: () => ctx.open('build') }, 'Build a product')];
      return [intro, ...products.map((p) => {
        const stats = h('div.inventory-stats'), delivery = h('p.small.inventory-delivery'), warning = h('p.small.inventory-warning');
        const fields = ['In stock', 'Installed copies', 'Units sold', 'Customer returns', 'Box receipts', 'Retailer fees', 'Refunds', 'Manufacturing', 'Buyback', 'Mailed patches'];
        const values = fields.map((label) => {
          const v = h('b.num'); stats.append(h('div', null, h('span.small.muted', { text: label }), v)); return v;
        });
        const buttons = B.preinternet.batches.map((units) => {
          const reason = h('span.small.muted');
          const button = h('button.btn', { onclick: () => ctx.act({ type: 'orderBatch', productId: p.id, units }) });
          return { units, button, reason, el: h('div.inventory-action', null, button, reason) };
        });
        const patchReason = h('span.small.muted');
        const patch = h('button.btn.blue', { onclick: () => ctx.act({ type: 'mailPatch', productId: p.id }) });
        bind((st) => {
          const current = st.products.find((x) => x.id === p.id); if (!current) return;
          const b = current.boxed;
          [fmtNum(b.stock), fmtNum(b.installed), fmtNum(b.unitsSold), fmtNum(b.returns), fmtMoney(b.grossSales - b.retailerFees - b.refunds),
            fmtMoney(b.retailerFees), fmtMoney(b.refunds), fmtMoney(b.manufacturingCost), fmtMoney(b.buybackCost), `${b.patches} · ${fmtMoney(b.patchCost)}`]
            .forEach((value, i) => setText(values[i], value));
          setText(delivery, b.deliveries.length ? b.deliveries.map((d) => `${fmtNum(d.units)} copies due in ${Math.max(0, d.dueWeek - st.week)} playable weeks`).join('; ') : 'No batch on order.');
          setText(warning, b.buybackWeek !== null && !b.returnsSettled ? `First shelf clearance in ${Math.max(0, b.buybackWeek - st.week)} playable weeks. Unsold copies will be withdrawn.`
            : b.stock === 0 && !current.killed ? 'Out of stock. Demand cannot become sales until a batch arrives.' : current.killed ? 'This product is sunset. Its inventory record remains here.' : 'Box receipts exclude retailer fees and customer refunds; production and patch costs are listed separately.');
          for (const { units, button, reason } of buttons) {
            const quote = batchQuote(st, current, units);
            setText(button, `Order ${fmtNum(quote.units || units)} · ${fmtMoney(quote.cost || units * B.preinternet.unitCost)}`);
            button.disabled = !!quote.reason; setText(reason, quote.reason ?? `${B.preinternet.leadWeeks} weeks to arrive`);
          }
          const quote = patchQuote(st, current);
          setText(patch, `Mail patch · ${fmtMoney(quote.cost)}`); patch.disabled = !!quote.reason;
          setText(patchReason, quote.reason ?? `Health ${Math.round(current.health)} to ${Math.round(current.baseHealth)} · version ${current.version}`);
        });
        return h('div.card.inventory-card', { dataset: { inventory: p.id } }, h('b', { text: p.name }), stats, delivery, warning,
          h('div.inventory-actions', null, ...buttons.map((b) => b.el), h('div.inventory-action', null, patch, patchReason)));
      })];
    });
}
