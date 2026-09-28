// Tech debt readout from state.debtFlow: last week's change by source (inflow +, paydown -) and net,
// the actual change after the 0..100 clamp.

export const DEBT_SOURCES = {
  work: 'Shipping code',
  automation: 'Automation',
  products: 'Live products',
  lowKnowledge: 'Low know-how',
  seniors: 'Senior engineers',
  maintenance: 'Maintenance',
  reviews: 'Reviews',
  oneOff: 'One-offs',
};

const EPS = 0.05;
const MINUS = '−';

export function fmtRate(v) {
  const r = Math.round(v * 10) / 10;
  if (Math.abs(r) < EPS) return '0';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}`;
}

// The biggest sources last week, largest first: [{ key, label, v }].
export function debtTop(flow, n = 3) {
  if (!flow) return [];
  return Object.keys(DEBT_SOURCES)
    .map((key) => ({ key, label: DEBT_SOURCES[key], v: Number(flow[key]) || 0 }))
    .filter((x) => Math.abs(x.v) >= EPS)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, n);
}


// { net, sources: 'Shipping code +1.2/wk, Reviews -0.9/wk', held: sentence or null, empty }
export function debtReadout(state) {
  const flow = state?.debtFlow;
  const net = Number(flow?.net) || 0;
  const top = debtTop(flow);
  const sources = top.map((x) => `${x.label} ${fmtRate(x.v)}/wk`).join(', ');
  // Paydowns scale with the debt, so it can't be held at zero; at the cap, inflows can't raise it.
  const held = Math.abs(net) < EPS && top.some((x) => x.v > 0) && (state.comprehensionDebt ?? 0) >= 99.5 ? 'Maxed out at 100' : null;
  return { net, sources, held, empty: !top.length };
}
