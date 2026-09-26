// A count goal's progress ("6 of 10 people") for a thin bar, when the goal data gives one:
// progress(state, h) -> { n, of }, with h from the sim's goalHelpers. Null otherwise.
import { h } from './dom.js';
import { SIMX } from './simapi.js';

const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);

export function goalProgress(s, g) {
  if (typeof g.progress !== 'function' || !SIMX.goalHelpers) return null;
  try {
    const p = g.progress(s, SIMX.goalHelpers(s));
    if (!p || !(p.of > 0)) return null;
    return { n: Math.max(0, Math.min(p.n, p.of)), of: p.of };
  } catch { return null; }
}

// The bar and its "n/of" label, or nothing.
export function progressBar(s, g) {
  const p = goalProgress(s, g);
  if (!p) return null;
  return h('div.gprog', { 'aria-label': `${short(p.n)} of ${short(p.of)}` },
    h('div.gbar', null, h('i', { style: { width: `${Math.round((p.n / p.of) * 100)}%` } })),
    h('span.num', { text: `${short(p.n)}/${short(p.of)}` }));
}

export const goalsDoneText = (done, total) => `${done} of ${total} done`;
